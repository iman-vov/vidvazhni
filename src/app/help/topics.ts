// Topics of the rules reference («Довідник»). Texts live in data/help/<lang>.json under
// `help.<id>.title` / `.short` (one sentence for popovers) / `.body` (paragraphs split by a blank
// line, `{icon:name}` placeholders); this file only orders them, gives each an icon and an optional
// diagram, and maps icons, rule hints and card keywords to topics.

import type { IconName } from '../../ui/icons/names';
import type { DiagramId } from './diagrams';

export type TopicGroup = 'basics' | 'board' | 'fight' | 'conditions' | 'elements' | 'cards' | 'world' | 'missions' | 'campaign';

export interface HelpTopic {
  id: string;
  group: TopicGroup;
  icon: IconName;
  diagram?: DiagramId;
  /** Shown only under these rules (`fork` = any fork toggle, `base` = elements of the base game). */
  rules?: 'fork' | 'base';
  related: string[];
}

export const TOPIC_GROUPS: readonly TopicGroup[] = ['basics', 'board', 'fight', 'conditions', 'elements', 'cards', 'world', 'missions', 'campaign'];

export const CONDITIONS = ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle', 'invisible', 'strengthen'] as const;

export const TOPICS: readonly HelpTopic[] = [
  { id: 'round', group: 'basics', icon: 'rotate', diagram: 'round', related: ['cards', 'initiative', 'turn', 'rest'] },
  { id: 'cards', group: 'basics', icon: 'hand', diagram: 'card', related: ['halves', 'initiative', 'discard'] },
  { id: 'halves', group: 'basics', icon: 'up', diagram: 'card', related: ['cards', 'turn', 'discard'] },
  { id: 'initiative', group: 'basics', icon: 'initiative', diagram: 'initiative', related: ['cards', 'round', 'intents', 'initiativeDie'] },
  { id: 'initiativeDie', group: 'basics', icon: 'dice', rules: 'fork', related: ['initiative', 'diceItems', 'xCards'] },
  { id: 'turn', group: 'basics', icon: 'hero', related: ['halves', 'move', 'attack', 'undo'] },
  { id: 'undo', group: 'basics', icon: 'undo', related: ['turn', 'modifiers'] },
  { id: 'goals', group: 'basics', icon: 'compass', related: ['secondary', 'zones', 'events', 'exhaustion'] },
  { id: 'hints', group: 'basics', icon: 'hint', related: ['intents', 'tutorial'] },
  { id: 'tutorial', group: 'basics', icon: 'play', related: ['round', 'cards'] },

  { id: 'move', group: 'board', icon: 'move', diagram: 'move', related: ['terrain', 'jump', 'push'] },
  { id: 'terrain', group: 'board', icon: 'trap', diagram: 'move', related: ['move', 'doors'] },
  { id: 'jump', group: 'board', icon: 'jump', related: ['move', 'terrain'] },
  { id: 'doors', group: 'board', icon: 'door', related: ['terrain', 'monsters'] },
  { id: 'loot', group: 'board', icon: 'loot', related: ['drops', 'items', 'shop'] },

  { id: 'attack', group: 'fight', icon: 'attack', diagram: 'attack', related: ['modifiers', 'shield', 'pierce', 'range'] },
  { id: 'range', group: 'fight', icon: 'ranged', related: ['attack', 'area'] },
  { id: 'area', group: 'fight', icon: 'area', related: ['attack', 'range'] },
  { id: 'modifiers', group: 'fight', icon: 'special', diagram: 'modifiers', related: ['attack', 'bless', 'curse', 'advantage', 'levels'] },
  { id: 'advantage', group: 'fight', icon: 'strengthen', related: ['modifiers', 'strengthen', 'muddle'] },
  { id: 'bless', group: 'fight', icon: 'bless', related: ['modifiers', 'curse'] },
  { id: 'curse', group: 'fight', icon: 'curse', related: ['modifiers', 'bless'] },
  { id: 'shield', group: 'fight', icon: 'shield', related: ['attack', 'pierce', 'retaliate'] },
  { id: 'pierce', group: 'fight', icon: 'pierce', related: ['shield', 'attack'] },
  { id: 'retaliate', group: 'fight', icon: 'retaliate', related: ['shield', 'attack'] },
  { id: 'push', group: 'fight', icon: 'push', diagram: 'push', related: ['move', 'terrain'] },
  { id: 'heal', group: 'fight', icon: 'heal', related: ['poison', 'wound', 'rest'] },
  { id: 'provoke', group: 'fight', icon: 'provoke', related: ['monsters'] },
  { id: 'summon', group: 'fight', icon: 'summon', related: ['monsters'] },
  { id: 'followUp', group: 'fight', icon: 'targets', rules: 'fork', related: ['attack', 'modifiers'] },
  { id: 'dodge', group: 'fight', icon: 'dice', rules: 'fork', related: ['cover', 'avoidDamage', 'shield', 'diceItems'] },
  { id: 'cover', group: 'fight', icon: 'shield', rules: 'fork', related: ['dodge', 'avoidDamage', 'shield', 'retaliate'] },

  ...CONDITIONS.map((c): HelpTopic => ({ id: c, group: 'conditions', icon: c, related: ['conditions', 'heal'] })),
  { id: 'conditions', group: 'conditions', icon: 'stun', related: [...CONDITIONS] },

  { id: 'orbs', group: 'elements', icon: 'orb-fire', diagram: 'orbs', rules: 'fork', related: ['momentum', 'elements'] },
  { id: 'elements', group: 'elements', icon: 'fire', diagram: 'elements', rules: 'base', related: ['orbs'] },
  { id: 'momentum', group: 'elements', icon: 'momentum', rules: 'fork', related: ['orbs', 'cards'] },

  { id: 'discard', group: 'cards', icon: 'discard', diagram: 'piles', related: ['rest', 'exhaustion', 'halves'] },
  { id: 'loss', group: 'cards', icon: 'loss', diagram: 'piles', related: ['discard', 'rest', 'exhaustion'] },
  { id: 'active', group: 'cards', icon: 'active', related: ['discard', 'loss'] },
  { id: 'rest', group: 'cards', icon: 'rest', diagram: 'piles', related: ['discard', 'loss', 'exhaustion'] },
  { id: 'avoidDamage', group: 'cards', icon: 'hp', related: ['loss', 'exhaustion', 'dodge', 'cover'] },
  { id: 'exhaustion', group: 'cards', icon: 'close', related: ['rest', 'revive', 'goals'] },
  { id: 'revive', group: 'cards', icon: 'revive', rules: 'fork', related: ['exhaustion'] },
  { id: 'xCards', group: 'cards', icon: 'dice', rules: 'fork', related: ['diceItems', 'modifiers', 'monsterX'] },

  { id: 'monsters', group: 'world', icon: 'monster', related: ['intents', 'provoke', 'elite'] },
  { id: 'elite', group: 'world', icon: 'elite', related: ['monsters'] },
  { id: 'intents', group: 'world', icon: 'approach', rules: 'fork', related: ['monsters', 'initiative', 'events', 'monsterX'] },
  { id: 'monsterX', group: 'world', icon: 'dice', rules: 'fork', related: ['xCards', 'intents', 'monsters'] },
  { id: 'items', group: 'world', icon: 'item', related: ['loot', 'rest', 'shop', 'diceItems'] },
  { id: 'diceItems', group: 'world', icon: 'reroll', rules: 'fork', related: ['initiativeDie', 'xCards', 'items', 'shop'] },
  { id: 'xp', group: 'world', icon: 'xp', related: ['levels'] },
  { id: 'levels', group: 'world', icon: 'xp', related: ['xp', 'modifiers', 'camp'] },

  { id: 'secondary', group: 'missions', icon: 'objective-flag', related: ['goals', 'levers'] },
  { id: 'zones', group: 'missions', icon: 'compass', related: ['goals', 'survive', 'escape', 'escort', 'collect'] },
  { id: 'survive', group: 'missions', icon: 'defend-point', related: ['zones', 'events', 'goals'] },
  { id: 'escape', group: 'missions', icon: 'door', related: ['zones', 'revive', 'goals'] },
  { id: 'escort', group: 'missions', icon: 'escort', related: ['zones', 'goals'] },
  { id: 'collect', group: 'missions', icon: 'item', related: ['zones', 'halves', 'goals'] },
  { id: 'levers', group: 'missions', icon: 'lever', related: ['doors', 'secondary', 'events'] },
  { id: 'events', group: 'missions', icon: 'monster', related: ['intents', 'survive', 'doors'] },

  { id: 'campaign', group: 'campaign', icon: 'map', related: ['camp', 'story'] },
  { id: 'story', group: 'campaign', icon: 'light', related: ['campaign'] },
  { id: 'camp', group: 'campaign', icon: 'rest', related: ['shop', 'partyChest', 'levels', 'campaign'] },
  { id: 'shop', group: 'campaign', icon: 'gold', related: ['upgrade', 'gifts', 'items'] },
  { id: 'upgrade', group: 'campaign', icon: 'up', related: ['shop', 'items'] },
  { id: 'gifts', group: 'campaign', icon: 'coin', related: ['shop', 'camp'] },
  { id: 'partyChest', group: 'campaign', icon: 'chest', related: ['drops', 'camp', 'shop'] },
  { id: 'drops', group: 'campaign', icon: 'loot', related: ['loot', 'partyChest'] },
];

const BY_ID = new Map(TOPICS.map((x) => [x.id, x]));

export function topicById(id: string): HelpTopic | undefined {
  return BY_ID.get(id);
}

/** Icons whose meaning has a topic of its own (a tap on such an icon opens its short explanation). */
const ICON_TOPICS: Partial<Record<IconName, string>> = {
  attack: 'attack',
  ranged: 'range',
  range: 'range',
  targets: 'attack',
  area: 'area',
  move: 'move',
  jump: 'jump',
  fly: 'jump',
  heal: 'heal',
  shield: 'shield',
  retaliate: 'retaliate',
  push: 'push',
  pull: 'push',
  pierce: 'pierce',
  loot: 'loot',
  provoke: 'provoke',
  summon: 'summon',
  infuse: 'orbs',
  consume: 'orbs',
  initiative: 'initiative',
  loss: 'loss',
  xp: 'xp',
  momentum: 'momentum',
  active: 'active',
  bless: 'bless',
  curse: 'curse',
  poison: 'poison',
  wound: 'wound',
  immobilize: 'immobilize',
  disarm: 'disarm',
  stun: 'stun',
  muddle: 'muddle',
  invisible: 'invisible',
  strengthen: 'strengthen',
  fire: 'orbs',
  ice: 'elements',
  air: 'orbs',
  earth: 'orbs',
  light: 'elements',
  dark: 'elements',
  any: 'orbs',
  'orb-fire': 'orbs',
  'orb-earth': 'orbs',
  'orb-air': 'orbs',
  door: 'doors',
  trap: 'terrain',
  chest: 'loot',
  coin: 'loot',
  monster: 'monsters',
  elite: 'elite',
  hand: 'cards',
  discard: 'discard',
  rest: 'rest',
  item: 'items',
  revive: 'revive',
  approach: 'intents',
  undo: 'undo',
  dice: 'initiativeDie',
  reroll: 'diceItems',
  gold: 'shop',
  'objective-flag': 'secondary',
  escort: 'escort',
  'defend-point': 'survive',
  lever: 'levers',
  map: 'campaign',
};

/** Topic for an icon; elements go to the orbs or the elements topic by the rules in play. */
export function topicForIcon(name: string, orbs = true): string | null {
  const id = ICON_TOPICS[name as IconName] ?? null;
  if (id === 'orbs' && !orbs) return 'elements';
  return id;
}

/** Topic for a rule hint key of the scenario screen (`condition.poison`, `orbs`, `shortRest`…). */
export function topicForHint(key: string): string | null {
  if (key.startsWith('condition.')) return key.slice('condition.'.length);
  const map: Record<string, string> = {
    elements: 'elements',
    orbs: 'orbs',
    trap: 'terrain',
    modifiers: 'modifiers',
    rooms: 'doors',
    downed: 'revive',
    momentum: 'momentum',
    initiative: 'initiative',
    shield: 'shield',
    loot: 'loot',
    avoidDamage: 'avoidDamage',
    shortRest: 'rest',
    longRest: 'rest',
    followUp: 'followUp',
    retaliate: 'retaliate',
    push: 'push',
    bless: 'bless',
    curse: 'curse',
    surge: 'momentum',
    items: 'items',
    exhaustion: 'exhaustion',
    initiativeDie: 'initiativeDie',
    dieCards: 'xCards',
    diceGear: 'diceItems',
    monsterDieAbilities: 'monsterX',
    dodgeDie: 'dodge',
    coverAlly: 'cover',
    itemFound: 'drops',
  };
  return map[key] ?? (topicById(key) ? key : null);
}

/** Topics shown for a game: fork-only topics hide under the base rules and vice versa. */
export function visibleTopics(rules: { orbs: boolean; fork: boolean } | null): HelpTopic[] {
  if (!rules) return [...TOPICS];
  return TOPICS.filter((x) => (x.rules === 'fork' ? rules.fork : x.rules === 'base' ? !rules.orbs : true));
}
