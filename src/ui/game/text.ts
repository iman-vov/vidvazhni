// Names and phrases for the game screen. Every word comes from i18n; step phrases reuse the
// shared step templates (step.*, area.*, condition.*) through the debug formatter.

import type { ConditionId, ElementId, HeroCard, Step } from '../../rules/content';
import { effectiveCard } from '../../rules/damage';
import type { LoadedContent } from '../../rules/load';
import type { FigureId, GameState } from '../../rules/state';
import type { Variants } from '../../rules/variants';
import { stepText } from '../debug/format';
import { has, t } from '../i18n';

export function className(classId: string): string {
  return t(`class.${classId}`);
}

export function monsterTypeName(typeId: string): string {
  return has(`monster.${typeId}`) ? t(`monster.${typeId}`) : t(`boss.${typeId}`);
}

/** Name of a figure id, also for figures that already left the state (dead monsters). */
export function figureName(id: FigureId, s?: GameState): string {
  const [kind, a, b] = id.split(':');
  if (kind === 'hero' && a) return className(a);
  if (kind === 'summon' && a) return has(`summon.${a}`) ? t(`summon.${a}`) : a;
  if (kind === 'monster' && a) {
    const f = s?.figures[id];
    const elite = f?.kind === 'monster' && f.rank === 'elite' ? ` (${t('game.elite')})` : '';
    return b ? `${monsterTypeName(a)} ${b}${elite}` : monsterTypeName(a);
  }
  if (has(`game.source.${id}`)) return t(`game.source.${id}`);
  return id;
}

export function cardName(cardId: string): string {
  return has(`card.${cardId}`) ? t(`card.${cardId}`) : cardId;
}

export function conditionName(c: ConditionId): string {
  return t(`condition.${c}`);
}

export function elementName(e: ElementId | 'any', orbs: boolean): string {
  if (e === 'any') return t(orbs ? 'orb.any' : 'element.any');
  return orbs && has(`orb.${e}`) ? t(`orb.${e}`) : t(`element.${e}`);
}

export function findCard(content: LoadedContent, classId: string, cardId: string): HeroCard | undefined {
  const card = content.heroes[classId]?.cards.find((c) => c.id === cardId);
  return card;
}

/** The card as the current variants play it (fork halves and initiative under `orbs`). */
export function playedCard(content: LoadedContent, classId: string, cardId: string, variants: Variants): HeroCard | undefined {
  const card = findCard(content, classId, cardId);
  return card ? effectiveCard(card, variants) : undefined;
}

export function hasMomentumMark(content: LoadedContent, classId: string, cardId: string, variants: Variants): boolean {
  return variants.momentum && !!findCard(content, classId, cardId)?.fork?.momentum;
}

export interface StepParts {
  icon: string;
  /** The step without its consume bonus and XP. */
  main: string;
  /** «Поглинути Вогонь: +2 Атака», or empty. */
  consume: string;
  consumeElement: ElementId | 'any' | null;
  xp: number;
}

const STEP_ICONS: Record<string, string> = {
  move: 'move',
  attack: 'attack',
  heal: 'heal',
  shield: 'shield',
  retaliate: 'retaliate',
  provoke: 'provoke',
  bless: 'bless',
  push: 'push',
  pull: 'pull',
  infuse: 'infuse',
  loot: 'loot',
  summon: 'summon',
  trap: 'trap',
  active: 'active',
  teleport: 'teleport',
  special: 'special',
};

export function stepIconName(step: Step): string {
  if (step.type === 'move' && step.jump) return 'jump';
  if (step.type === 'move' && step.fly) return 'fly';
  if (step.type === 'attack' && step.range) return 'range';
  if (step.type === 'condition') return step.condition;
  if (step.type === 'infuse') return step.element;
  return STEP_ICONS[step.type] ?? 'special';
}

export function stepParts(step: Step, orbs: boolean, relative = false): StepParts {
  const { xp, consume, ...rest } = step;
  const bare = rest as Step;
  const main = stepText(bare, orbs, relative);
  const full = consume ? stepText({ ...bare, consume } as Step, orbs, relative) : main;
  return {
    icon: stepIconName(step),
    main,
    consume: consume ? full.slice(main.length).replace(/^;\s*/, '') : '',
    consumeElement: consume?.element ?? null,
    xp: xp ?? 0,
  };
}

/** One line per step, for compact places (prompts, the enlarged card uses stepParts). */
export function stepLine(step: Step, orbs: boolean): string {
  return stepText(step, orbs);
}

/** «Атака 3 → 5» for an orb/element bonus. */
export function bonusText(stepType: string, value: number, boosted: number): string {
  const stat = has(`stat.${stepType}`) ? t(`stat.${stepType}`) : has(`game.stat.${stepType}`) ? t(`game.stat.${stepType}`) : '';
  return t('game.bonus', { stat, value, boosted }).trim();
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0';
}

/** Modifier card id as shown on the big card: `+1`, `−2`, `×2`, «Промах», «Благословення»… */
export function modifierLabel(id: string): string {
  const base = id.split(':')[0] ?? id;
  if (base === 'x2' || base === 'bless') return '×2';
  if (base === 'miss' || base === 'curse') return t('game.modifier.miss');
  return base.replace('-', '−');
}
