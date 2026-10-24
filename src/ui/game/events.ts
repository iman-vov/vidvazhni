// Short sentences for the event log on the game screen, and the first-encounter rule explanations
// of hint level 1. Bookkeeping events (cards moving, decks shuffling) are left out.

import type { GameEvent, GameState } from '../../rules/state';
import { has, t } from '../i18n';
import { conditionName, elementName, figureName, modifierLabel } from './text';

export function eventLine(e: GameEvent, s: GameState): string | null {
  const n = (id: string) => figureName(id, s);
  switch (e.type) {
    case 'roundStarted':
      return t('log.roundStarted', { round: e.round });
    case 'turnStarted':
      return t('log.turnStarted', { name: n(e.figureId) });
    case 'attacked':
      return t('game.ev.attacked', { attacker: n(e.attackerId), target: n(e.targetId), mod: modifierLabel(e.chosen), damage: e.damage }) + (e.followUp ? ` (${t('variant.followUp')})` : '') + (e.shield > 0 ? ` (${t('game.ev.shieldShort', { shield: e.shield })})` : '');
    case 'damaged':
      return e.source.includes(':') || e.amount === 0 ? null : t('game.ev.damaged', { name: n(e.figureId), amount: e.amount });
    case 'healed':
      return t('log.healed', { name: n(e.figureId), amount: e.amount });
    case 'conditionAdded':
      return t('game.ev.condition', { name: n(e.figureId), condition: conditionName(e.condition) });
    case 'shieldAdded':
      return t('game.ev.shield', { name: n(e.figureId), value: e.value });
    case 'retaliated':
      return t('game.ev.retaliated', { name: n(e.figureId), target: n(e.targetId), damage: e.damage });
    case 'elementChanged':
      return e.level === 'strong' ? t('game.ev.infused', { element: elementName(e.element, false) }) : null;
    case 'orbInfused':
      return t('game.ev.orbInfused', { element: elementName(e.orb, true), name: n(e.ownerId) });
    case 'orbConsumed':
      return t('game.ev.orbConsumed', { element: elementName(e.orb, true), name: n(e.byId) });
    case 'roomRevealed':
      return t('log.roomRevealed', { name: t(`room.${e.roomId}`) });
    case 'figureDied':
      return t('log.died', { name: n(e.figureId) });
    case 'heroExhausted':
      return t('log.exhausted', { name: n(e.heroId) });
    case 'heroDowned':
      return t('game.ev.downed', { name: n(e.heroId) });
    case 'heroRevived':
      return t('game.ev.revived', { name: n(e.heroId), by: n(e.byId) });
    case 'surgeUsed':
      return t('game.ev.surge', { name: n(e.heroId) });
    case 'looted':
      return e.coins || e.chest ? t('game.ev.looted', { name: n(e.heroId), coins: e.coins }) : null;
    case 'trapTriggered':
      return t('game.ev.trap', { name: n(e.figureId), damage: e.damage });
    case 'rested':
      return t(e.kind === 'short' ? 'game.ev.shortRest' : 'game.ev.longRest', { name: n(e.heroId) });
    case 'xpGained':
      return null;
    case 'damageAvoided':
      return t('game.ev.avoided', { name: n(e.heroId) });
    case 'behaviourDrawn':
      return null;
    case 'itemUsed':
      return t('game.ev.item', { name: n(e.heroId), item: t(`item.${e.itemId}`) });
    case 'dieRolled':
      return e.previous === undefined ? t('game.ev.dieRolled', { name: n(e.figureId), roll: e.roll }) : t('game.ev.dieRerolled', { name: n(e.figureId), previous: e.previous, roll: e.roll });
    case 'scenarioWon':
      return t('log.scenarioWon');
    case 'scenarioLost':
      return t('log.scenarioLost');
    case 'undone':
      return t('game.ev.undone');
    default:
      return null;
  }
}

export interface RuleHint {
  key: string;
  title: string;
  text: string;
}

/** Rule explanations a batch of events brings up for the first time (hint level 1). */
export function ruleHints(events: GameEvent[]): RuleHint[] {
  const out: RuleHint[] = [];
  const add = (key: string, title: string, text: string) => {
    if (!out.some((x) => x.key === key)) out.push({ key, title, text });
  };
  const topic = (key: string, id = key) => {
    if (has(`help.${id}.title`)) add(key, t(`help.${id}.title`), t(`help.${id}.short`));
  };
  for (const e of events) {
    if (e.type === 'conditionAdded') add(`condition.${e.condition}`, conditionName(e.condition), t(`condition.${e.condition}.text`));
    else if (e.type === 'elementChanged' && e.level === 'strong') add('elements', t('ui.elements'), t('game.explain.elements'));
    else if (e.type === 'orbInfused') add('orbs', t('ui.orbs'), t('game.explain.orbs'));
    else if (e.type === 'trapTriggered') add('trap', t('game.hint.trap.title'), t('game.hint.trap'));
    else if (e.type === 'attacked') add('modifiers', t('game.hint.modifiers.title'), t('game.hint.modifiers'));
    else if (e.type === 'roomRevealed') add('rooms', t('game.hint.rooms.title'), t('game.hint.rooms'));
    else if (e.type === 'heroDowned') add('downed', t('variant.reviveAlly'), t('variant.reviveAlly.text'));
    else if (e.type === 'momentumGained') add('momentum', t('variant.momentum'), t('variant.momentum.text'));
    else if (e.type === 'cardsRevealed') add('initiative', t('ui.initiative'), t('game.hint.initiative'));
    else if (e.type === 'shieldAdded') add('shield', t('stat.shield'), t('game.explain.shield'));
    else if (e.type === 'looted' && (e.coins > 0 || e.chest)) add('loot', t('game.hint.loot.title'), t('game.hint.loot'));
    // Rules with a reference topic (src/app/help): its title and short text.
    if (e.type === 'attacked' && e.followUp) topic('followUp');
    else if (e.type === 'retaliated') topic('retaliate');
    else if (e.type === 'pushed') topic('push');
    else if (e.type === 'obstacleDamaged' || e.type === 'obstacleMoved') topic('doors');
    else if (e.type === 'itemUsed' || e.type === 'itemReaction') topic('items');
    else if (e.type === 'heroExhausted') topic('exhaustion');
    if (e.type === 'momentumGained' && e.charges >= 3) topic('surge', 'momentum');
    if (e.type === 'attacked' && e.modifiers.some((d) => d.startsWith('bless'))) topic('bless');
    if (e.type === 'attacked' && e.modifiers.some((d) => d.startsWith('curse'))) topic('curse');
  }
  return out;
}
