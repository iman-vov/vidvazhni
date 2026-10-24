// Names of the game's own icons. Each name is one file in ./svg/<name>.svg (24×24 viewBox); the list
// is checked against the files by tests/ui/icons.test.ts. Labels for screen readers: `icon.<name>`
// in data/i18n.

export const ICON_GROUPS = {
  actions: ['attack', 'ranged', 'range', 'targets', 'move', 'jump', 'fly', 'heal', 'shield', 'retaliate', 'push', 'pull', 'pierce', 'area', 'loot', 'provoke', 'infuse', 'consume', 'summon', 'teleport', 'special'],
  marks: ['initiative', 'loss', 'xp', 'momentum', 'active', 'bless', 'curse'],
  conditions: ['poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle', 'invisible', 'strengthen'],
  elements: ['fire', 'ice', 'air', 'earth', 'light', 'dark', 'any', 'orb-fire', 'orb-earth', 'orb-air'],
  world: ['door', 'trap', 'chest', 'coin', 'hp', 'monster', 'hero', 'elite'],
  interface: ['hand', 'discard', 'rest', 'item', 'approach', 'hold', 'early', 'late', 'undo', 'skip', 'menu', 'close', 'left', 'right', 'up', 'down', 'check', 'rotate', 'hint', 'revive', 'arrow', 'add-player', 'remove-player'],
  menu: ['play', 'compass', 'map', 'gear'],
} as const;

export type IconGroup = keyof typeof ICON_GROUPS;
export type IconName = (typeof ICON_GROUPS)[IconGroup][number];

export const ICON_NAMES: readonly IconName[] = Object.values(ICON_GROUPS).flat();

export function isIconName(name: string): name is IconName {
  return (ICON_NAMES as readonly string[]).includes(name);
}
