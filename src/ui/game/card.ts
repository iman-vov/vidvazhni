// A hero ability card rendered from data: name, initiative, the top and bottom halves as readable
// lines with icons, loss / active / XP marks, the «Наснага» lightning, and orb/element bonuses that
// will be payable glowing as «Атака 3 → 5» (orbBonusPreview).

import type { AreaShape, CardHalf, Step } from '../../rules/content';
import type { LoadedContent } from '../../rules/load';
import type { OrbBonusPreview } from '../../rules/queries';
import type { GameState, HeroState } from '../../rules/state';
import { h } from '../dom';
import { areaDiagram, areaText } from './areaDiagram';
import { t } from '../i18n';
import { icon, type IconName } from './icons';
import { rich } from '../icons';
import { bonusText, cardName, hasMomentumMark, playedCard, stepParts } from './text';
import frames from './cardFrames.json';

type Rect = { x: number; y: number; w: number; h: number };
interface Frame {
  size: number[];
  plate: Rect;
  top: Rect;
  bottom: Rect;
  initiative: Rect;
  compact: { size: number[]; slice: number[] };
}

/** The class's painted card frame (tools/card-frames.mjs): zones as fractions of the frame. */
function frameOf(classId: string): Frame | undefined {
  return (frames as Record<string, Frame>)[classId];
}

const frameUrl = (classId: string, compact = false) => `${import.meta.env.BASE_URL}ui/cards/frame-${classId}${compact ? '-compact' : ''}.webp`;

/** Puts a zone of the frame on an element as --<name>-x/y/w/h percentages. */
function setZone(el: HTMLElement, name: string, r: Rect): void {
  for (const k of ['x', 'y', 'w', 'h'] as const) el.style.setProperty(`--${name}-${k}`, `${+(r[k] * 100).toFixed(2)}%`);
}

export type Half = 'top' | 'bottom';

export interface CardOptions {
  s: GameState;
  content: LoadedContent;
  hero: HeroState;
  cardId: string;
  bonuses?: OrbBonusPreview[];
  picked?: boolean;
  leading?: boolean;
  /** Halves already played this turn (shown crossed out). */
  playedHalves?: Half[];
  /** Turn play: each half is a button. */
  onHalf?: (half: Half) => void;
  /** Halves that can be played now (others are disabled). */
  playable?: Half[];
  /** A small extra row under the card (basic action buttons). */
  footer?: HTMLElement | null;
  big?: boolean;
  /** The hero's colour: frame accent and the illustration placeholder. */
  accent?: string;
  /** Everything in words (turn tray, detail view): marks spelled out, no placeholder art. */
  full?: boolean;
}

export function cardView(o: CardOptions): HTMLElement {
  const card = playedCard(o.content, o.hero.classId, o.cardId, o.s.variants);
  const orbs = o.s.variants.orbs;
  const classes = ['gcard'];
  if (o.big) classes.push('is-big');
  if (o.full) classes.push('is-full');
  if (o.picked) classes.push('is-picked');
  if (o.leading) classes.push('is-leading');
  if (!card) return h('div', { class: classes.join(' ') }, cardName(o.cardId));
  // Until card art exists: the class colour with the icon of the card's main action.
  const main = card.top.steps[0] ?? card.bottom.steps[0];
  const art = h('div', { class: 'gcard-art', 'aria-hidden': 'true' }, main ? icon(stepParts(main, orbs).icon) : null);
  const momentum = hasMomentumMark(o.content, o.hero.classId, o.cardId, o.s.variants);
  const head = h(
    'div',
    { class: 'gcard-head' },
    h('b', { class: 'gcard-name' }, cardName(o.cardId)),
    momentum ? icon('momentum', 'gcard-momentum', t('ui.momentum')) : null,
    o.leading ? h('span', { class: 'gcard-leadtag', title: t('game.leading') }, icon('initiative')) : null,
    h('span', { class: 'gcard-ini', title: t('ui.initiative') }, card.initiative),
  );
  const half = (which: Half, data: CardHalf) => {
    const lines = data.steps.map((step, i) => {
      const p = stepParts(step, orbs);
      // An area attack draws its shape below, so the words for it go.
      const area = step.type === 'attack' ? step.area : undefined;
      const main = area ? p.main.replace(`, ${areaText(area)}`, '') : p.main;
      const bonus = o.bonuses?.find((b) => b.half === which && b.stepIndex === i);
      return h(
        'div',
        { class: 'gstep' },
        h('div', { class: 'gstep-main' }, icon(p.icon), h('span', null, main), p.xp ? h('span', { class: 'gmark gmark-xp', title: t('ui.xp') }, icon('xp'), p.xp) : null),
        area ? h('div', { class: 'gstep-area' }, areaDiagram(area)) : null,
        p.consume
          ? h('div', { class: 'gstep-consume' }, icon(p.consumeElement && p.consumeElement !== 'any' ? p.consumeElement : 'any', `el-${p.consumeElement ?? 'any'}`), h('span', null, p.consume))
          : null,
        bonus && bonus.value !== undefined && bonus.boosted !== undefined && bonus.value !== bonus.boosted
          ? h(
              'div',
              { class: `gbonus${bonus.available ? ' is-on' : ''}${bonus.now ? ' is-now' : ''}`, title: t(bonus.now ? 'game.bonus.now' : bonus.available ? 'game.bonus.later' : 'game.bonus.no') },
              icon(bonus.element === 'any' ? 'any' : bonus.element),
              rich(bonusText(bonus.stepType, bonus.value, bonus.boosted)),
            )
          : null,
      );
    });
    const marks = h(
      'div',
      { class: 'gcard-marks' },
      data.loss ? h('span', { class: 'gmark gmark-loss', title: t('game.card.loss') }, icon('loss'), o.big || o.full ? t('game.card.loss') : null) : null,
      data.active ? h('span', { class: 'gmark gmark-active', title: t('game.card.active') }, icon('active'), o.big || o.full ? t('game.card.active') : null) : null,
    );
    const played = o.playedHalves?.includes(which);
    const cls = `gcard-half gcard-${which}${played ? ' is-played' : ''}`;
    if (o.onHalf) {
      const enabled = o.playable ? o.playable.includes(which) : true;
      return h(
        'button',
        { class: `${cls} is-button`, disabled: !enabled, 'aria-label': `${cardName(o.cardId)}: ${t(which === 'top' ? 'ui.playTop' : 'ui.playBottom')}`, onclick: () => o.onHalf?.(which) },
        lines,
        marks,
      );
    }
    return h('div', { class: cls }, lines, marks);
  };
  const frame = frameOf(o.hero.classId);
  if (frame) {
    // The painted frame: name on the plate, initiative in the ring, the halves in the two parchment blocks.
    classes.push('has-frame');
    const face = h('div', { class: 'gcard-face' }, head, half('top', card.top), half('bottom', card.bottom));
    face.style.backgroundImage = `url(${frameUrl(o.hero.classId)})`;
    face.style.aspectRatio = `${frame.size[0]} / ${frame.size[1]}`;
    setZone(face, 'plate', frame.plate);
    setZone(face, 'top', frame.top);
    setZone(face, 'bottom', frame.bottom);
    setZone(face, 'ini', frame.initiative);
    const el = h('div', { class: classes.join(' '), 'data-card': o.cardId }, face, o.footer ?? null);
    if (o.accent) el.style.setProperty('--accent', o.accent);
    return el;
  }
  const el = h(
    'div',
    { class: classes.join(' '), 'data-card': o.cardId },
    head,
    o.full ? null : art,
    half('top', card.top),
    h('div', { class: 'gcard-divider' }),
    half('bottom', card.bottom),
    o.footer ?? null,
  );
  if (o.accent) el.style.setProperty('--accent', o.accent);
  return el;
}

// ─── Compact card for the round's choice: name, initiative, both halves as icon summaries ──────

interface Glyph {
  icon: IconName;
  n?: number | string;
  /** An area attack: drawn as its small hex pattern instead of the icon. */
  area?: AreaShape;
}

/** A step as short icons with numbers: «attack 3, range 4, push 1, fire +2». */
export function stepGlyphs(step: Step): Glyph[] {
  const g: Glyph[] = [{ icon: stepParts(step, false).icon, ...(numberOf(step) !== undefined ? { n: numberOf(step) } : {}) }];
  if (step.type === 'attack') {
    if (step.range) g.push({ icon: 'range', n: step.range });
    if (step.targets && step.targets > 1) g.push({ icon: 'targets', n: step.targets });
    if (step.area) g.push({ icon: 'area', area: step.area });
    if (step.pierce) g.push({ icon: 'pierce', n: step.pierce });
    if (step.push) g.push({ icon: 'push', n: step.push });
    if (step.pull) g.push({ icon: 'pull', n: step.pull });
    for (const c of step.conditions ?? []) g.push({ icon: c });
    if (step.curse) g.push({ icon: 'curse' });
  }
  if ((step.type === 'heal' || step.type === 'condition' || step.type === 'pull') && step.range) g.push({ icon: 'range', n: step.range });
  if (step.consume) {
    const add = step.consume.add ?? {};
    const plus = (add.value ?? 0) + (add.move ?? 0);
    g.push({ icon: step.consume.element === 'any' ? 'any' : step.consume.element, ...(plus ? { n: `+${plus}` } : {}) });
  }
  if (step.xp) g.push({ icon: 'xp', n: step.xp });
  return g;
}

function numberOf(step: Step): number | undefined {
  if (step.type === 'provoke') return step.radius;
  if (step.type === 'loot' || step.type === 'teleport') return step.range;
  if (step.type === 'trap') return step.damage;
  return 'value' in step && typeof step.value === 'number' ? step.value : undefined;
}

function glyphRow(half: CardHalf): HTMLElement {
  return h(
    'div',
    { class: 'gcc-row' },
    half.steps.map((st, i) => [
      i > 0 ? h('span', { class: 'gcc-sep' }) : null,
      stepGlyphs(st).map((x) => h('span', { class: 'gcc-glyph' }, x.area ? areaDiagram(x.area) : icon(x.icon), x.n !== undefined ? h('b', null, x.n) : null)),
    ]),
    half.loss ? h('span', { class: 'gcc-glyph gmark-loss', title: t('game.card.loss') }, icon('loss')) : null,
    half.active ? h('span', { class: 'gcc-glyph gmark-active', title: t('game.card.active') }, icon('active')) : null,
  );
}

export interface CompactCardOptions {
  s: GameState;
  content: LoadedContent;
  hero: HeroState;
  cardId: string;
  accent?: string;
  picked?: boolean;
  leading?: boolean;
  /** A bonus will be payable on this card (orb/element glow). */
  bonus?: boolean;
  /** Small select button in the corner (the card body opens the details). */
  onToggle?: () => void;
}

export function compactCard(o: CompactCardOptions): HTMLElement {
  const card = playedCard(o.content, o.hero.classId, o.cardId, o.s.variants);
  const cls = ['gcc'];
  if (o.picked) cls.push('is-picked');
  if (o.leading) cls.push('is-leading');
  if (o.bonus) cls.push('has-bonus');
  const frame = frameOf(o.hero.classId);
  if (frame) cls.push('has-frame');
  const el = h(
    'div',
    { class: cls.join(' '), 'data-card': o.cardId, role: 'button', tabindex: '0', 'aria-label': cardName(o.cardId) },
    h(
      'div',
      { class: 'gcc-head' },
      h('b', { class: 'gcc-name' }, cardName(o.cardId)),
      o.leading ? h('span', { class: 'gcc-lead', title: t('game.leading'), 'aria-label': t('game.leading') }, icon('initiative')) : null,
      hasMomentumMark(o.content, o.hero.classId, o.cardId, o.s.variants) ? icon('momentum', 'gcard-momentum', t('ui.momentum')) : null,
      h('span', { class: 'gcard-ini', title: t('ui.initiative') }, card?.initiative ?? ''),
    ),
    card ? glyphRow(card.top) : null,
    h('div', { class: 'gcard-divider' }),
    card ? glyphRow(card.bottom) : null,
    o.onToggle
      ? h(
          'button',
          {
            class: `gcc-pick${o.picked ? ' is-on' : ''}`,
            'aria-pressed': String(!!o.picked),
            'aria-label': o.picked ? t('game.card.unpick') : t('game.card.pick'),
            onclick: (e: Event) => {
              e.stopPropagation();
              o.onToggle?.();
            },
          },
          icon(o.picked ? 'check' : 'hand'),
        )
      : null,
  );
  if (frame) {
    // The short frame (plate, one parchment block, bottom rim) as a 9-slice; slices in its pixels.
    const [t0, r0, b0, l0] = frame.compact.slice;
    el.style.borderImageSource = `url(${frameUrl(o.hero.classId, true)})`;
    el.style.borderImageSlice = `${t0} ${r0} ${b0} ${l0} fill`;
    el.style.setProperty('--gcc-t', String(t0));
    el.style.setProperty('--gcc-r', String(r0));
    el.style.setProperty('--gcc-b', String(b0));
    el.style.setProperty('--gcc-l', String(l0));
  }
  if (o.accent) el.style.setProperty('--accent', o.accent);
  return el;
}

/** Explanations of the words on a card (conditions, elements, loss, active, momentum, XP). */
export function cardKeywords(s: GameState, content: LoadedContent, hero: HeroState, cardId: string): { title: string; text: string; topic?: string }[] {
  const card = playedCard(content, hero.classId, cardId, s.variants);
  if (!card) return [];
  const out = new Map<string, { title: string; text: string; topic?: string }>();
  const orbs = s.variants.orbs;
  for (const half of [card.top, card.bottom]) {
    if (half.loss) out.set('loss', { title: t('game.card.loss'), text: t('game.explain.loss'), topic: 'loss' });
    if (half.active) out.set('active', { title: t('game.card.active'), text: t('game.explain.active'), topic: 'active' });
    for (const st of half.steps) {
      const conds = [...(st.type === 'attack' ? (st.conditions ?? []) : []), ...(st.type === 'condition' ? [st.condition] : []), ...(st.consume?.conditions ?? [])];
      for (const c of conds) out.set(`c-${c}`, { title: t(`condition.${c}`), text: t(`condition.${c}.text`), topic: c });
      if (st.type === 'infuse' || st.consume) out.set('el', { title: t(orbs ? 'ui.orbs' : 'ui.elements'), text: t(orbs ? 'game.explain.orbs' : 'game.explain.elements'), topic: orbs ? 'orbs' : 'elements' });
      if (st.type === 'shield') out.set('shield', { title: t('stat.shield'), text: t('game.explain.shield'), topic: 'shield' });
      if (st.type === 'retaliate') out.set('ret', { title: t('stat.retaliate'), text: t('game.explain.retaliate'), topic: 'retaliate' });
      if (st.xp) out.set('xp', { title: t('ui.xp'), text: t('game.explain.xp'), topic: 'xp' });
    }
  }
  if (hasMomentumMark(content, hero.classId, cardId, s.variants)) out.set('mom', { title: t('variant.momentum'), text: t('variant.momentum.text'), topic: 'momentum' });
  return [...out.values()];
}
