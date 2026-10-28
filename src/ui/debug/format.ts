// Readable text for figures, cards, steps, actions and events. All words come from i18n;
// this file only picks keys and fills placeholders.

import type { CardHalf, ConditionId, Content, Duration, HeroCard, Step } from '../../rules/content';
import type { Action, Figure, GameEvent, GameState, StepChoice } from '../../rules/state';
import type { Variants } from '../../rules/variants';
import { loadContent } from '../../rules/load';
import { has, t } from '../i18n';

/** Name of a figure id, also for figures that already left the state (dead monsters). */
export function figureName(id: string, s?: GameState): string {
  const [kind, a, b] = id.split(':');
  if (kind === 'hero' && a) return t(`class.${a}`);
  if (kind === 'summon' && a) return t(`summon.${a}`);
  if (kind === 'monster' && a) {
    const f = s?.figures[id];
    const base = has(`monster.${a}`) ? t(`monster.${a}`) : t(`boss.${a}`);
    const elite = f?.kind === 'monster' && f.rank === 'elite' ? ` ${t('debug.eliteMark')}` : '';
    return b ? `${base} ${b}${elite}` : base;
  }
  return id;
}

export function cardName(cardId: string): string {
  return has(`card.${cardId}`) ? t(`card.${cardId}`) : cardId;
}

export function conditionName(c: ConditionId): string {
  return t(`condition.${c}`);
}

export function elementName(e: string, orbs: boolean): string {
  return orbs && has(`orb.${e}`) ? t(`orb.${e}`) : t(`element.${e}`);
}

function elementAcc(e: string, orbs: boolean): string {
  return orbs && has(`orb.${e}.acc`) ? t(`orb.${e}.acc`) : t(`element.${e}.acc`);
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

/** One step as a short phrase. `relative` = monster card values are deltas to base stats. */
export function stepText(step: Step, orbs: boolean, relative = false): string {
  const v = (n: number) => (relative ? signed(n) : String(n));
  const parts: string[] = [];
  switch (step.type) {
    case 'move':
      parts.push(t('step.move', { value: v(step.value) }));
      if (step.jump) parts.push(t('step.jump'));
      if (step.fly) parts.push(t('step.fly'));
      if (step.straightLine) parts.push(t('step.straightLine'));
      break;
    case 'attack':
      parts.push(t('step.attack', { value: v(step.value) }));
      if (step.range !== undefined) parts.push(t('step.range', { value: v(step.range) }));
      if (step.targets && step.targets > 1) parts.push(t('step.targets', { value: step.targets }));
      if (step.area) parts.push(t(`area.${step.area.shape}`, step.area.shape === 'line' ? { length: step.area.length } : {}));
      if (step.targetAll) parts.push(t(`step.targetAll.${step.targetAll}`));
      if (step.pierce) parts.push(t('step.pierce', { value: step.pierce }));
      if (step.advantage) parts.push(t('step.grant.advantage'));
      if (step.push) parts.push(t('step.push', { value: step.push }));
      if (step.pull) parts.push(t('step.pull', { value: step.pull }));
      for (const c of step.conditions ?? []) parts.push(conditionName(c));
      if (step.curse) parts.push(t('step.curse'));
      for (const b of step.bonuses ?? []) parts.push(t(`step.bonus.${b.if}`, { value: b.attack ?? 0 }));
      break;
    case 'heal':
      parts.push(t('step.heal', { value: step.value }), targetText(step.target, step.radius));
      if (step.range) parts.push(t('step.range', { value: step.range }));
      if (step.removeNegative) parts.push(t('step.removeNegative', { value: step.removeNegative }));
      if (step.bless) parts.push(t('step.bless'));
      break;
    case 'shield':
      // A shield's `range` is the radius for «alliesInRadius» (resolveTargets) and the reach otherwise.
      parts.push(`${t('step.shield', { value: step.value })} ${durationText(step.duration)}`, targetText(step.target, step.range));
      if (step.range && step.target !== 'alliesInRadius') parts.push(t('step.range', { value: step.range }));
      break;
    case 'retaliate':
      parts.push(`${t('step.retaliate', { value: step.value })} ${durationText(step.duration)}`);
      if (step.range) parts.push(t('step.range', { value: step.range }));
      break;
    case 'provoke':
      parts.push(t('step.provoke', { radius: step.radius }));
      break;
    case 'condition':
      parts.push(conditionName(step.condition), targetText(step.target, step.radius));
      if (step.range) parts.push(t('step.range', { value: step.range }));
      break;
    case 'bless':
      parts.push(t('step.bless'), targetText(step.target));
      break;
    case 'push':
      parts.push(t('step.push', { value: step.value }), targetText(step.target));
      break;
    case 'pull':
      parts.push(t('step.pull', { value: step.value }), targetText(step.target));
      break;
    case 'infuse':
      parts.push(t('step.infuse', { element: elementAcc(step.element, orbs) }));
      break;
    case 'loot':
      parts.push(t('step.loot', { range: step.range }));
      break;
    case 'summon':
      parts.push(
        step.count && step.count > 1
          ? t('step.summon.count', { count: step.count, name: summonName(step.summon) })
          : t('step.summon', { name: summonName(step.summon) }),
      );
      break;
    case 'trap':
      parts.push(t('step.trap', { damage: step.damage }));
      for (const c of step.conditions ?? []) parts.push(conditionName(c));
      break;
    case 'active': {
      const grant: string[] = [];
      if (step.grant.advantage) grant.push(t('step.grant.advantage'));
      if (step.grant.range) grant.push(t('step.grant.range', { value: step.grant.range }));
      if (step.grant.shield) grant.push(t('step.shield', { value: step.grant.shield }));
      for (const c of step.grant.conditions ?? []) grant.push(conditionName(c));
      parts.push(t(`step.active.${step.on}`, { uses: step.uses, effect: grant.join(', ') }));
      break;
    }
    case 'teleport':
      parts.push(t('step.teleport', { range: step.range }));
      break;
    case 'special':
      parts.push(has(`special.${step.name}`) ? t(`special.${step.name}`, stringParams(step.params)) : step.name);
      break;
  }
  let text = parts.filter(Boolean).join(', ');
  if (step.consume) {
    const c = step.consume;
    const eff: string[] = [];
    const add = c.add ?? {};
    for (const [k, n] of Object.entries(add)) if (n) eff.push(`+${n} ${statName(k, step.type)}`);
    for (const cond of c.conditions ?? []) eff.push(conditionName(cond));
    if (c.replaceConditions) eff.push(t('step.replaceConditions', { conditions: c.replaceConditions.map(conditionName).join(', ') }));
    if (c.extraTarget) eff.push(t('step.extraTarget'));
    if (c.curse) eff.push(t('step.curse'));
    if (c.area) eff.push(t(`area.${c.area.shape}`, c.area.shape === 'line' ? { length: c.area.length } : {}));
    for (const th of c.then ?? []) eff.push(`${t('step.then')} ${stepText(th, orbs)}`);
    const element = c.element === 'any' ? t(orbs ? 'orb.any.acc' : 'element.any.acc') : elementAcc(c.element, orbs);
    text +=
      '; ' +
      (c.count && c.count > 1
        ? t('step.consume.count', { count: c.count, element, effect: eff.join(', ') })
        : t('step.consume', { element, effect: eff.join(', ') }));
  }
  if (step.xp) text += ` · ${t('step.xp', { value: step.xp })}`;
  return text;
}

/** Name of a consume bonus field; `value` means the step's own number (Атака, Рух, Лікування…). */
function statName(field: string, stepType: Step['type']): string {
  if (field === 'value') {
    if (stepType === 'attack' || stepType === 'move' || stepType === 'shield' || stepType === 'retaliate') return t(`stat.${stepType}`);
    if (stepType === 'heal') return t('debug.stat.heal');
  }
  return t(`debug.stat.${field}`);
}

function stringParams(p: Record<string, number | string | boolean> | undefined): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(p ?? {})) out[k] = typeof v === 'boolean' ? String(v) : v;
  return out;
}

function summonName(id: string): string {
  if (has(`summon.${id}`)) return t(`summon.${id}`);
  if (has(`monster.${id}`)) return t(`monster.${id}`);
  return id;
}

function targetText(target: string, radius?: number): string {
  if (target === 'self') return '';
  return t(`target.${target}`, { radius: radius ?? 0 });
}

function durationText(d: Duration): string {
  if (typeof d === 'object') return t('duration.uses', { uses: d.uses });
  return t(`duration.${d}`);
}

export function halfText(half: CardHalf, orbs: boolean): string {
  const text = half.steps.map((s) => stepText(s, orbs)).join('; ');
  const marks: string[] = [];
  if (half.loss) marks.push(t('debug.card.loss'));
  if (half.active) marks.push(t('debug.card.active'));
  return marks.length ? `${text} [${marks.join(', ')}]` : text;
}

/** The card as the current variants play it: fork halves replace base halves while any fork
 *  variant that changes cards is on (orbs: Lід/Світло/Темрява cards get fork versions). */
export function cardForVariants(card: HeroCard, variants: Variants): { initiative: number; top: CardHalf; bottom: CardHalf; momentum: boolean } {
  const fork = variants.orbs ? card.fork : undefined;
  return {
    initiative: fork?.initiative ?? card.initiative,
    top: fork?.top ?? card.top,
    bottom: fork?.bottom ?? card.bottom,
    momentum: variants.momentum && !!card.fork?.momentum,
  };
}

export function findHeroCard(content: Content, classId: string, cardId: string): HeroCard | undefined {
  return content.heroes[classId]?.cards.find((c) => c.id === cardId);
}

function hexText(h: [number, number]): string {
  return `${h[0]},${h[1]}`;
}

/** Short description of a step choice, for the list of all choices. */
export function choiceText(choice: StepChoice, s: GameState, orbs: boolean): string {
  const parts: string[] = [];
  if (choice.path) parts.push(`{icon:arrow} ${hexText(choice.path[choice.path.length - 1] as [number, number])} (${choice.path.length})`);
  if (choice.targets) parts.push(choice.targets.map((id) => figureName(id, s)).join(' + '));
  if (choice.hex) parts.push(`${t('debug.hex')} ${hexText(choice.hex)}`);
  if (choice.direction !== undefined) parts.push(`${t('debug.direction')} ${choice.direction}`);
  if (choice.element) parts.push(elementName(choice.element, orbs));
  if (choice.elements) parts.push(choice.elements.map((e) => elementName(e, orbs)).join(' + '));
  if (choice.consume) parts.push(t('debug.consume'));
  return parts.length ? parts.join(' · ') : t('debug.resolve');
}

/** Short description of any action (generic buttons and the replay list). */
export function actionText(a: Action, s: GameState): string {
  switch (a.type) {
    case 'surge':
      return `${t('ui.useSurge')}: ${figureName(a.heroId, s)}`;
    case 'reviveAlly':
      return `${t('ui.revive')}: ${figureName(a.targetId, s)} (${cardName(a.cardId)}, ${t(a.half === 'top' ? 'ui.playTop' : 'ui.playBottom')})`;
    case 'undo':
      return t('ui.undo');
    case 'skipStep':
      return t('ui.skip');
    case 'endTurn':
      return t('ui.endTurn');
    case 'resolveStep':
      return choiceText(a.choice, s, s.variants.orbs);
    default:
      if ((a as { type: string }).type === 'useItem') return t(`item.${(a as unknown as { itemId: string }).itemId}`);
      return t(`debug.action.${a.type}`);
  }
}

/** One event as a sentence, or null for bookkeeping events that are not worth a line. */
export function eventText(e: GameEvent, s: GameState): string | null {
  const n = (id: string) => figureName(id, s);
  const orbs = s.variants.orbs;
  switch (e.type) {
    case 'roundStarted':
      return t('log.roundStarted', { round: e.round });
    case 'roundEnded':
      return t('debug.ev.roundEnded', { round: e.round });
    case 'intentsDrawn':
      return t('debug.ev.intentsDrawn', { name: t(`monster.${e.typeId}`), cards: e.cards.map((id) => behaviourCardName(id, e.typeId)).join(', ') });
    case 'cardsRevealed':
      return t('debug.ev.cardsRevealed', { order: e.order.map((o) => `${entryName(o, s)} ${o.initiative}`).join(' {icon:arrow} ') });
    case 'turnStarted':
      return t('log.turnStarted', { name: n(e.figureId) });
    case 'turnEnded':
      return null;
    case 'moved':
      return t('debug.ev.moved', { name: n(e.figureId), to: hexText(e.path[e.path.length - 1] ?? [0, 0]), steps: e.path.length });
    case 'pushed':
      return t(e.pull ? 'debug.ev.pulled' : 'debug.ev.pushed', { name: n(e.figureId), steps: e.path.length });
    case 'attacked':
      return t('debug.ev.attacked', {
        attacker: n(e.attackerId),
        target: n(e.targetId),
        base: e.base,
        mods: e.modifiers.join(' / '),
        chosen: e.chosen,
        shield: e.shield,
        damage: e.damage,
      }) + (e.followUp ? ` (${t('variant.followUp')})` : '');
    case 'damaged':
      return t('debug.ev.damaged', { name: n(e.figureId), amount: e.amount });
    case 'healed':
      return t('log.healed', { name: n(e.figureId), amount: e.amount }) + (e.removed.length ? ` (−${e.removed.map(conditionName).join(', ')})` : '');
    case 'conditionAdded':
      return t('debug.ev.conditionAdded', { name: n(e.figureId), condition: conditionName(e.condition) });
    case 'conditionRemoved':
      return t('debug.ev.conditionRemoved', { name: n(e.figureId), condition: conditionName(e.condition) });
    case 'shieldAdded':
      return t('debug.ev.shieldAdded', { name: n(e.figureId), value: e.value });
    case 'retaliated':
      return t('debug.ev.retaliated', { name: n(e.figureId), target: n(e.targetId), damage: e.damage });
    case 'elementChanged':
      return t('debug.ev.elementChanged', { element: elementName(e.element, orbs), level: t(`element.state.${e.level}`) });
    case 'orbInfused':
      return t('debug.ev.orbInfused', { orb: t(`orb.${e.orb}`), name: n(e.ownerId) });
    case 'orbConsumed':
      return t('debug.ev.orbConsumed', { orb: t(`orb.${e.orb}`), name: n(e.byId), owner: n(e.fromId) });
    case 'orbDimmed':
      return t('debug.ev.orbDimmed', { orb: t(`orb.${e.orb}`) });
    case 'orbExpired':
      return t('debug.ev.orbExpired', { orb: t(`orb.${e.orb}`) });
    case 'roomRevealed':
      return t('log.roomRevealed', { name: t(`room.${e.roomId}`) });
    case 'figureSpawned':
      return t('debug.ev.spawned', { name: n(e.figureId) });
    case 'figureDied':
      return t('log.died', { name: n(e.figureId) });
    case 'heroExhausted':
      return t('log.exhausted', { name: n(e.heroId) }) + ` (${t(`debug.exhaust.${e.reason}`)})`;
    case 'heroDowned':
      return t('debug.ev.downed', { name: n(e.heroId) });
    case 'heroRevived':
      return t('debug.ev.revived', { name: n(e.heroId), by: n(e.byId) });
    case 'momentumGained':
      return t('debug.ev.momentum', { name: n(e.heroId), charges: e.charges });
    case 'surgeUsed':
      return t('debug.ev.surge', { name: n(e.heroId) });
    case 'looted':
      return t('debug.ev.looted', { name: n(e.heroId), coins: e.coins }) + (e.chest ? ` + ${t('debug.marker.chest')}` : '');
    case 'trapTriggered':
      return t('debug.ev.trap', { name: n(e.figureId), damage: e.damage });
    case 'cardMoved':
      return t('debug.ev.cardMoved', { name: n(e.heroId), card: cardName(e.cardId), to: t(`debug.pile.${e.to}`) });
    case 'rested':
      return t(`debug.ev.rested.${e.kind}`, { name: n(e.heroId), card: cardName(e.lost) });
    case 'xpGained':
      return t('debug.ev.xp', { name: n(e.heroId), amount: e.amount });
    case 'deckShuffled':
      return t('debug.ev.shuffled', { deck: deckName(e.deck) });
    case 'scenarioWon':
      return t('log.scenarioWon');
    case 'scenarioLost':
      return t('log.scenarioLost');
    case 'behaviourDrawn':
      return t('debug.ev.behaviour', { name: t(`monster.${e.typeId}`), initiative: e.initiative });
    case 'damageAvoided':
      return t('debug.ev.avoided', { name: n(e.heroId), amount: e.amount, cards: e.lost.map(cardName).join(', ') });
    case 'trapPlaced':
      return t('debug.ev.trapPlaced', { hex: hexText(e.hex) });
    case 'undone':
      return t('debug.ev.undone');
    default:
      return forkEventText(e as unknown as { type: string; heroId?: string; itemId?: string; itemIds?: string[]; to?: string }, s);
  }
}

/** Events the fork engine adds (items); matched by name so older engines still type-check. */
function forkEventText(e: { type: string; heroId?: string; itemId?: string; itemIds?: string[]; to?: string }, s: GameState): string {
  const name = e.heroId ? figureName(e.heroId, s) : '';
  if (e.type === 'itemUsed' && e.itemId) return t('debug.ev.itemUsed', { name, item: t(`item.${e.itemId}`), state: t(`debug.itemState.${e.to ?? 'spent'}`) });
  if (e.type === 'itemsRefreshed') return t('debug.ev.itemsRefreshed', { name, items: (e.itemIds ?? []).map((id) => t(`item.${id}`)).join(', ') });
  return JSON.stringify(e);
}

/** A monster behaviour card: its own name (fork cards) or the template card's initiative. */
function behaviourCardName(cardId: string, typeId: string): string {
  const c = loadContent();
  const deckId = c.monsters[typeId]?.deck ?? c.bosses[typeId]?.deck;
  const card = (deckId ? c.decks[deckId]?.cards.find((x) => x.id === cardId) : undefined) ?? c.monsters[typeId]?.forkCards?.find((x) => x.id === cardId);
  const ini = card ? Math.min(99, Math.max(1, card.initiative + (c.monsters[typeId]?.initiativeOffset ?? 0))) : null;
  const name = has(`monsterCard.${cardId}`) ? `«${t(`monsterCard.${cardId}`)}» ` : '';
  return ini === null ? cardId : `${name}${ini}`;
}

function deckName(deck: string): string {
  if (deck.startsWith('hero:')) return t('debug.deck.hero', { name: figureName(deck) });
  if (deck.startsWith('modifier:')) return t('debug.deck.hero', { name: figureName(deck.slice('modifier:'.length)) });
  if (deck === 'monster' || deck === 'monsters') return t('debug.deck.monsters');
  if (has(`monster.${deck}`)) return t(`monster.${deck}`);
  return deck;
}

export function entryName(e: { kind: string; figureId?: string; typeId?: string }, s: GameState): string {
  if (e.kind === 'monsterGroup' && e.typeId) return has(`monster.${e.typeId}`) ? t(`monster.${e.typeId}`) : t(`boss.${e.typeId}`);
  return e.figureId ? figureName(e.figureId, s) : '?';
}

/** Short token label: hero 3 letters + HP, monster standee number + HP. */
export function tokenLabel(f: Figure): string {
  const hp = `${f.hp}/${f.maxHp}`;
  if (f.kind === 'hero') return `${t(`class.${f.classId}`).slice(0, 3)} ${hp}`;
  if (f.kind === 'monster') return `${f.rank === 'elite' ? t('debug.eliteMark') : ''}${f.number} · ${hp}`;
  return `${t(`summon.${f.summonId}`).slice(0, 3)} ${hp}`;
}
