// WebAudio engine: three buses (music, SFX, voice) under a master gain, buffers fetched and decoded
// on first use (never precached), music with crossfades and ducking under voice, silence while the
// tab is hidden. The AudioContext is created suspended and resumed on the first tap (iOS needs a
// user gesture); sounds asked for before that are dropped, music waits and starts on unlock.

import { AmbientBed, type AmbientDef } from './ambient';
import { AUDIO, type AudioTable, type MusicDef } from './cues';
import { playMotif, type MotifVariant } from './motif';
import { playSynth } from './synth';

export interface Volumes {
  music: number;
  sound: number;
  voice: number;
}

const MUSIC_FADE = 1.6;
const LOOP_FADE = 3;
const DUCK = 0.35;

interface Playing {
  id: string;
  def: MusicDef;
  gain: GainNode;
  sources: AudioBufferSourceNode[];
  timer: ReturnType<typeof setTimeout> | null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: { music: GainNode; sfx: GainNode; voice: GainNode; duck: GainNode };
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private volumes: Volumes = { music: 0.6, sound: 0.8, voice: 0.8 };
  private music: Playing | null = null;
  /** The track asked for (it may still be loading, or waiting for the unlock). */
  private wanted: string | null = null;
  private hidden = false;
  private ducks = 0;
  /** The Lantern theme to play before `id` starts, and the timer of one that is playing. */
  private intro: { id: string; variant: MotifVariant } | null = null;
  private introTimer: ReturnType<typeof setTimeout> | null = null;
  private introFor: string | null = null;
  private bed: AmbientBed | null = null;
  private wantedBed: { key: string; def: AmbientDef } | null = null;
  private bedKey: string | null = null;
  private intensity = 0;

  constructor(
    private readonly base: string,
    private readonly table: AudioTable = AUDIO,
  ) {}

  get unlocked(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Call from a user gesture (pointerdown / keydown): creates or resumes the context. */
  unlock(): void {
    const ctx = this.context();
    if (!ctx || this.hidden) return;
    if (ctx.state !== 'running') void ctx.resume().then(() => this.startWanted());
    // iOS: a silent buffer played inside the gesture opens the audio route.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start();
  }

  setVolumes(v: Volumes): void {
    this.volumes = { ...v };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.bus.music.gain.setTargetAtTime(curve(v.music), now, 0.05);
    this.bus.sfx.gain.setTargetAtTime(curve(v.sound), now, 0.05);
    this.bus.voice.gain.setTargetAtTime(curve(v.voice), now, 0.05);
  }

  /** Tab hidden: everything stops (suspend); shown again: resumes. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else if (this.ctx.state === 'suspended') void this.ctx.resume().then(() => this.startWanted());
  }

  /** One sound by id from data/audio.json, `delay` seconds from now. */
  play(id: string, delay = 0): void {
    const def = this.table.sounds[id];
    const ctx = this.ctx;
    if (!def || !ctx || !this.unlocked || this.volumes.sound <= 0) return;
    if (def.synth) {
      playSynth(def.synth, { ctx, dest: this.bus.sfx, at: ctx.currentTime + Math.max(0, delay) + 0.005 }, def.volume ?? 1);
      return;
    }
    const files = def.files ?? [];
    const file = files[Math.floor(Math.random() * files.length)];
    if (!file) return;
    const at = ctx.currentTime + Math.max(0, delay);
    void this.load(file).then((buf) => {
      if (!buf || !this.unlocked) return;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (def.pitch) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * def.pitch;
      const g = ctx.createGain();
      g.gain.value = def.volume ?? 1;
      src.connect(g).connect(this.bus.sfx);
      // A late buffer (first load) still plays, just now.
      src.start(Math.max(at, ctx.currentTime));
    });
  }

  /** Switches the music to `id` (crossfade); null fades it out. The same track keeps playing. With
   *  `intro`, the Lantern theme plays first and the track comes in under its last bar. */
  setMusic(id: string | null, intro?: MotifVariant): void {
    if (id === this.wanted) return;
    this.wanted = id;
    this.intro = id && intro ? { id, variant: intro } : null;
    if (id && this.table.music[id]) void this.load(this.table.music[id].file);
    this.startWanted();
  }

  /** A track played once over a faded-out music (victory, defeat); the music does not come back
   *  until setMusic is called with another track. */
  stinger(id: string): void {
    this.wanted = `stinger:${id}`;
    this.fadeOut(this.music, 0.6);
    this.music = null;
    this.setAmbient(null);
    if (id.startsWith('motif:')) {
      if (this.unlocked) this.motif(id.slice(6) as MotifVariant, 0.3);
      return;
    }
    const def = this.table.music[id];
    if (!def) return;
    void this.load(def.file).then(() => {
      if (this.wanted === `stinger:${id}`) this.start(id, { ...def, loop: 'none' }, 0.05);
    });
  }

  /** Voice is speaking: the music goes down (nested calls stack). Returns the release. */
  duck(): () => void {
    this.ducks++;
    this.applyDuck();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.ducks--;
      this.applyDuck();
    };
  }

  /** The Lantern theme on the music bus, `delay` s from now; returns its length (0 when silent). */
  motif(variant: MotifVariant, delay = 0): number {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked) return 0;
    return playMotif(variant, { ctx, dest: this.bus.music, at: ctx.currentTime + delay });
  }

  /** The bed under the music (null: none); the same `key` keeps the running one. */
  setAmbient(def: AmbientDef | null | undefined, key = ''): void {
    this.wantedBed = def ? { key, def } : null;
    this.startBed();
  }

  /** 0 calm … 1 tense (adaptive ambient). */
  setIntensity(x: number): void {
    this.intensity = x;
    this.bed?.setIntensity(x);
  }

  /** The voice bus, for the later TTS step. */
  get voiceBus(): GainNode | null {
    return this.ctx ? this.bus.voice : null;
  }

  // ─── internals ─────────────────────────────────────────────────────────

  private context(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // Where autoplay is allowed the context starts running by itself, a moment later.
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running' && !this.hidden) this.startWanted();
    });
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    const duck = ctx.createGain();
    duck.connect(this.master);
    this.bus = { music: ctx.createGain(), sfx: ctx.createGain(), voice: ctx.createGain(), duck };
    this.bus.music.connect(duck);
    this.bus.sfx.connect(this.master);
    this.bus.voice.connect(this.master);
    this.setVolumes(this.volumes);
    return ctx;
  }

  private applyDuck(): void {
    if (!this.ctx) return;
    this.bus.duck.gain.setTargetAtTime(this.ducks > 0 ? DUCK : 1, this.ctx.currentTime, 0.25);
  }

  private load(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      const ctx = this.context();
      p = !ctx
        ? Promise.resolve(null)
        : fetch(this.base + file)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${file}`))))
            .then((data) => ctx.decodeAudioData(data))
            .catch((err: unknown) => {
              console.warn('audio: could not load', file, err);
              this.buffers.delete(file);
              return null;
            });
      this.buffers.set(file, p);
    }
    return p;
  }

  private startBed(): void {
    const w = this.wantedBed;
    if (!this.ctx || !this.unlocked) return;
    if (w && this.bed && this.bedKey === w.key) return;
    this.bed?.stop();
    this.bed = null;
    this.bedKey = null;
    if (!w) return;
    this.bed = new AmbientBed(this.ctx, this.bus.music, w.def);
    this.bedKey = w.key;
    this.bed.setIntensity(this.intensity);
  }

  private startWanted(): void {
    const id = this.wanted;
    if (!this.ctx || !this.unlocked || id?.startsWith('stinger:')) return;
    this.startBed();
    if (this.music?.id === id) return;
    // The theme is playing before this very track: let it finish.
    if (this.introTimer && this.introFor === id) return;
    if (this.introTimer) {
      clearTimeout(this.introTimer);
      this.introTimer = null;
    }
    this.fadeOut(this.music, MUSIC_FADE);
    this.music = null;
    const def = id ? this.table.music[id] : undefined;
    if (!id || !def) return;
    if (this.intro?.id === id) {
      const length = this.motif(this.intro.variant, 0.1);
      this.intro = null;
      void this.load(def.file);
      this.introFor = id;
      this.introTimer = setTimeout(() => {
        this.introTimer = null;
        if (this.wanted === id && !this.music && this.unlocked) this.start(id, def, MUSIC_FADE * 2);
      }, Math.max(0, length - 2) * 1000);
      return;
    }
    void this.load(def.file).then(() => {
      if (this.wanted === id && !this.music && this.unlocked) this.start(id, def, MUSIC_FADE);
    });
  }

  private start(id: string, def: MusicDef, fadeIn: number): void {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.connect(this.bus.music);
    const target = def.volume ?? 1;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(target, ctx.currentTime + fadeIn);
    const playing: Playing = { id, def, gain, sources: [], timer: null };
    this.music = playing;
    void this.pass(playing, ctx.currentTime);
  }

  /** One pass of the track from `at`; a crossfade loop schedules the next pass over its end. */
  private async pass(p: Playing, at: number): Promise<void> {
    const buf = await this.load(p.def.file);
    const ctx = this.ctx;
    if (!buf || !ctx || this.music !== p) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    src.connect(g).connect(p.gain);
    if (p.def.loop === 'seamless') src.loop = true;
    if (p.def.loop === 'crossfade' && p.sources.length) {
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(1, at + LOOP_FADE);
    }
    src.start(at);
    p.sources = [...p.sources.slice(-1), src];
    if (p.def.loop !== 'crossfade') return;
    const next = at + buf.duration - LOOP_FADE;
    // Scheduled a little ahead, on the context clock (timers sleep with the tab).
    p.timer = setTimeout(() => void this.pass(p, Math.max(next, ctx.currentTime)), Math.max(0, (next - ctx.currentTime - 1) * 1000));
  }

  private fadeOut(p: Playing | null, seconds: number): void {
    if (!p || !this.ctx) return;
    if (p.timer) clearTimeout(p.timer);
    const now = this.ctx.currentTime;
    p.gain.gain.cancelScheduledValues(now);
    p.gain.gain.setValueAtTime(Math.max(0.0001, p.gain.gain.value), now);
    p.gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    for (const s of p.sources) {
      try {
        s.stop(now + seconds + 0.05);
      } catch {
        // already stopped
      }
    }
    setTimeout(() => p.gain.disconnect(), (seconds + 0.2) * 1000);
  }
}

/** Slider 0..1 → gain: a squared curve sounds even over the slider's travel. */
function curve(v: number): number {
  return Math.max(0, Math.min(1, v)) ** 2;
}
