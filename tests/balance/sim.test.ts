// Balance simulator (docs/balance/sim-2026-10-24.md): the greedy bot of the replay tests plays
// s1–s5 with the default rules (FULL_FORK) for many parties, levels and seeds, and writes the raw
// results as JSON lines. Off by default; run one scenario per process, e.g.
//   SIM=1 SIM_SCENARIO=s2 SIM_SEEDS=20 SIM_OUT=out/s2.jsonl npx vitest run tests/balance/sim.test.ts
// SIM_LEVELS (default 1,2,3), SIM_PARTIES ('pairs', 'big', 'all' or 'warden,rogue;herbalist,tinker'), SIM_VARIANTS (JSON merged
// over FULL_FORK, e.g. {"dodgeDie":false}), SIM_FLAGS (campaign flags, e.g. mirrors.aligned).

import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'vitest';
import { apply, createGame } from '../../src/rules/engine';
import { loadContent } from '../../src/rules/load';
import type { GameSetup, GameState } from '../../src/rules/state';
import { FULL_FORK } from '../../src/rules/variants';
import { chooseAction } from '../replay/bot';

const HEROES = ['warden', 'wind-archer', 'herbalist', 'rogue', 'elementalist', 'tinker'];
const BIG: string[][] = [
  ['warden', 'wind-archer', 'herbalist'],
  ['rogue', 'elementalist', 'tinker'],
  ['warden', 'rogue', 'elementalist'],
  ['warden', 'wind-archer', 'herbalist', 'rogue'],
  ['elementalist', 'tinker', 'herbalist', 'wind-archer'],
];
const MAX_ROUNDS = 40;
/** Items a party of this level would have bought (start gold 15, then the shop). */
const KIT: Record<number, string[]> = { 1: ['healing-potion'], 2: ['healing-potion', 'buckler'], 3: ['healing-potion', 'buckler', 'luck-potion', 'dagger'] };

function pairs(): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < HEROES.length; i++) for (let j = i + 1; j < HEROES.length; j++) out.push([HEROES[i]!, HEROES[j]!]);
  return out;
}

export interface SimResult {
  scenario: string;
  party: string[];
  level: number;
  seed: number;
  won: boolean;
  rounds: number;
  end: 'won' | 'cards' | 'damage' | 'timeout' | 'error';
  error?: string;
  heroes: { classId: string; xp: number; dealt: number; healed: number; taken: number; exhausted: boolean; lost: number; hand: number }[];
  heroInitiative: number[];
  monsterInitiative: number[];
  dodges: number;
  covers: number;
}

/** SIM_TRACE=1: a line per round (heroes' hp, hand/discard/lost, hex; monsters left) and the losses. */
function trace(s: GameState, events: GameState['log'], a: unknown): void {
  if (process.env.SIM_TRACE === '2') {
    console.log('  > ' + JSON.stringify(a));
    for (const e of events) if (['attacked', 'moved', 'healed', 'conditionAdded', 'figureDied', 'turnStarted'].includes(e.type)) console.log('     ' + JSON.stringify(e).slice(0, 160));
  }
  for (const e of events) {
    if (e.type === 'roundStarted') {
      const hs = Object.values(s.figures).flatMap((f) =>
        f.kind === 'hero' ? [`${f.classId} hp${f.hp} h${f.hand.length}/d${f.discard.length}/l${f.lost.length} @${f.hex}`] : [],
      );
      const ms = Object.values(s.figures).filter((f) => f.kind === 'monster').map((f) => `${f.id.slice(8)}:${f.hp}@${f.hex}`);
      console.log(`R${e.round} ${hs.join(' | ')} || ${ms.join(' ')}`);
    }
    if (e.type === 'cardMoved' && e.to === 'lost') console.log(`   lost ${e.heroId} ${e.cardId}`);
    if (e.type === 'roomRevealed') console.log('   by ' + JSON.stringify(a));
    if (e.type === 'rested' || e.type === 'damageAvoided' || e.type === 'heroExhausted' || e.type === 'roomRevealed') console.log('   ' + JSON.stringify(e));
  }
}

function play(setup: GameSetup, content: ReturnType<typeof loadContent>): SimResult {
  let s: GameState = createGame(setup, content);
  const base = { scenario: setup.scenarioId, party: setup.heroes.map((h) => h.classId), level: setup.heroes[0]!.level, seed: setup.seed };
  let error: string | undefined;
  let n = 0;
  // The engine never reads the log back: keep it here and clear it in the state, so the bot's
  // look-ahead clones stay small (a 10× speed-up on long games).
  const log: GameState['log'] = [...s.log];
  s = { ...s, log: [] };
  try {
    while (s.phase !== 'won' && s.phase !== 'lost' && s.round <= MAX_ROUNDS && n++ < 20000) {
      const a = chooseAction(s, content);
      const r = apply(s, a, content);
      if (!r.ok) throw new Error(`round ${s.round}: ${r.error}`);
      log.push(...r.events);
      s = { ...r.state, log: [] };
      if (process.env.SIM_TRACE) trace(s, r.events, a);
    }
  } catch (e) {
    error = String(e).slice(0, 200);
  }
  const heroIds = Object.values(s.figures).filter((f) => f.kind === 'hero').map((f) => f.id);
  const owner = (id: string) => {
    const f = s.figures[id];
    return f?.kind === 'summon' ? (f as { ownerId?: string }).ownerId ?? id : id;
  };
  const heroes = heroIds.map((id) => {
    const h = s.figures[id] as Extract<GameState['figures'][string], { kind: 'hero' }>;
    let dealt = 0;
    let healed = 0;
    let taken = 0;
    for (const e of log) {
      if (e.type === 'attacked' && owner(e.attackerId) === id && e.targetId.startsWith('monster:')) dealt += e.damage;
      if (e.type === 'retaliated' && e.figureId === id) dealt += e.damage;
      if (e.type === 'damaged' && e.figureId === id) taken += e.amount;
    }
    return { classId: h.classId, xp: h.xp, dealt, healed, taken, exhausted: h.exhausted, lost: h.lost.length, hand: h.hand.length };
  });
  // Heals: credit the hero whose turn it was (the healer), self-heals included.
  let turn: string | undefined;
  for (const e of log) {
    if (e.type === 'turnStarted') turn = (e as { figureId?: string }).figureId;
    if (e.type === 'healed' && e.figureId.startsWith('hero:') && turn) {
      const i = heroIds.indexOf(owner(turn));
      if (i >= 0) heroes[i]!.healed += e.amount;
    }
  }
  const heroInitiative: number[] = [];
  const monsterInitiative: number[] = [];
  for (const e of log) {
    if (e.type !== 'cardsRevealed') continue;
    for (const o of e.order) (o.kind === 'monsterGroup' ? monsterInitiative : o.kind === 'hero' ? heroInitiative : []).push(o.initiative);
  }
  const won = s.phase === 'won';
  const end: SimResult['end'] = error
    ? 'error'
    : won
      ? 'won'
      : s.phase !== 'lost'
        ? 'timeout'
        : log.some((e) => e.type === 'heroExhausted' && e.reason === 'cards')
          ? 'cards'
          : 'damage';
  return {
    ...base,
    won,
    rounds: s.round,
    end,
    ...(error ? { error } : {}),
    heroes,
    heroInitiative,
    monsterInitiative,
    dodges: log.filter((e) => e.type === 'dodgeRolled').length,
    covers: log.filter((e) => e.type === 'allyCovered').length,
  };
}

describe.skipIf(!process.env.SIM)('balance simulator', () => {
  it('plays the configured games', { timeout: 6 * 3600_000 }, () => {
    const content = loadContent();
    const scenario = process.env.SIM_SCENARIO ?? 's1';
    const seeds = Number(process.env.SIM_SEEDS ?? 10);
    const levels = (process.env.SIM_LEVELS ?? '1,2,3').split(',').map(Number);
    const which = process.env.SIM_PARTIES ?? 'all';
    const parties = which === 'pairs' ? pairs() : which === 'big' ? BIG : which === 'all' ? [...pairs(), ...BIG] : which.split(';').map((p) => p.split(','));
    const variants = { ...FULL_FORK, ...(process.env.SIM_VARIANTS ? JSON.parse(process.env.SIM_VARIANTS) : {}) };
    const out = process.env.SIM_OUT ?? `out/sim-${scenario}.jsonl`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, '');
    for (const level of levels)
      for (const party of parties)
        for (let seed = 1; seed <= seeds; seed++) {
          const setup: GameSetup = {
            scenarioId: scenario,
            seed,
            heroes: party.map((classId, i) => ({ classId, playerId: `p${i + 1}`, level, items: KIT[level] })),
            difficulty: 'normal',
            variants,
            ...(process.env.SIM_FLAGS ? { flags: process.env.SIM_FLAGS.split(',') } : {}),
          };
          fs.appendFileSync(out, JSON.stringify(play(setup, content)) + '\n');
        }
  });
});
