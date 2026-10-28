// The item catalog (docs/design/items.md): every item in data/items.json has names in uk/de/en,
// a valid source, and only effects the engine plays; the own-turn items are used once in a game.
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import de from '../../data/i18n/de.json';
import en from '../../data/i18n/en.json';
import uk from '../../data/i18n/uk.json';
import type { ItemDef, Step } from '../../src/rules/content';
import { createGame } from '../../src/rules/engine';
import { firstFreeNeighbor } from '../../src/rules/effects/support';
import { DICE_ITEM_SPECIALS } from '../../src/rules/diceItems';
import { SELF_ITEM_SPECIALS, STEP_ITEM_SPECIALS } from '../../src/rules/items';
import { loadContent } from '../../src/rules/load';
import { act, fillerCards, makeContent, selectAll, setupFor } from '../helpers/engineFixtures';

const content = loadContent();
const items = Object.values(content.items);
const LANGS: Record<string, Record<string, string>> = { uk, de, en };
const MONSTERS = readdirSync('data/monsters').map((f) => f.replace(/\.json$/, ''));

/** Specials a passive item may carry (read by attack.ts / move.ts). */
const PASSIVE_SPECIALS = ['rangedRangeBonus', 'movePenalty'];
/** Targets an item step reaches without a choice (items are used with an empty choice). */
const NO_CHOICE_TARGETS = ['self', 'adjacentAllies', 'alliesInRadius', 'adjacentEnemies', 'enemiesInRadius'];

/** Why this step cannot be played by an item, or null. */
function plainStepError(st: Step): string | null {
  if (st.consume) return 'items cannot consume elements';
  switch (st.type) {
    case 'heal':
    case 'shield':
    case 'condition':
    case 'bless':
      return NO_CHOICE_TARGETS.includes(st.target) ? null : `target ${st.target} needs a choice`;
    case 'push':
    case 'pull':
      return st.target === 'adjacentEnemies' ? null : `${st.type} needs adjacentEnemies`;
    case 'infuse':
      return st.element === 'any' ? 'infuse any needs a choice' : null;
    case 'retaliate':
    case 'provoke':
    case 'loot':
      return null;
    default:
      return `${st.type} is not played by items`;
  }
}

function effectError(def: ItemDef, steps: Step[]): string | null {
  const specials = steps.filter((st): st is Extract<Step, { type: 'special' }> => st.type === 'special');
  if (def.use === 'passive') {
    for (const st of steps) {
      if (st.type === 'special' ? !PASSIVE_SPECIALS.includes(st.name) : !(st.type === 'shield' && st.target === 'self' && st.duration === 'persistent')) {
        return `passive ${st.type} does nothing`;
      }
    }
    return null;
  }
  const dice = specials.filter((st) => DICE_ITEM_SPECIALS.includes(st.name));
  if (dice.length > 1) return 'more than one dice special';
  for (const st of steps) {
    if (st.type !== 'special') {
      const err = plainStepError(st);
      if (err) return err;
    } else if (dice.length > 0 ? !DICE_ITEM_SPECIALS.includes(st.name) : ![...STEP_ITEM_SPECIALS, ...SELF_ITEM_SPECIALS].includes(st.name)) {
      return `special ${st.name} is not an item special here`;
    }
  }
  return null;
}

function versions(def: ItemDef): [string, Step[]][] {
  const out: [string, Step[]][] = [['effect', def.effect]];
  if (def.forkEffect) out.push(['forkEffect', def.forkEffect]);
  if (def.upgrade) out.push(['upgrade', def.upgrade.effect]);
  if (def.upgrade?.forkEffect) out.push(['upgrade.forkEffect', def.upgrade.forkEffect]);
  return out;
}

describe('item catalog', () => {
  it('has 50 items, at least 6 per slot', () => {
    expect(items.length).toBeGreaterThanOrEqual(50);
    for (const slot of ['head', 'body', 'legs', 'hand', 'twoHands']) expect(items.filter((it) => it.slot === slot).length, slot).toBeGreaterThanOrEqual(6);
    for (const it of items) expect(it.kind === undefined, it.id).toBe(it.slot !== 'small');
  });

  it('every item and its ★ version are named in uk, de and en', () => {
    for (const it of items) {
      for (const [lang, dict] of Object.entries(LANGS)) {
        expect(dict[`item.${it.id}`], `${lang} item.${it.id}`).toBeTruthy();
        if (it.upgrade) expect(dict[`item.${it.id}.plus`], `${lang} item.${it.id}.plus`).toBe(`${dict[`item.${it.id}`]}+`);
      }
    }
  });

  it('every source is valid; legendary items come only from bosses and secrets', () => {
    for (const it of items) {
      const src = it.source;
      expect(src, it.id).toBeDefined();
      if (!src) continue;
      if (src.type === 'shop') expect(src.at, it.id).toBeUndefined();
      else if (src.type === 'drop') expect(MONSTERS, it.id).toContain(src.at);
      else expect(src.at, it.id).toMatch(/^s([1-9]|1[0-9]|2[0-5])$/);
      if (it.rarity === 'legendary') expect(['boss', 'secret'], it.id).toContain(src.type);
    }
  });

  it('every effect is one the engine plays', () => {
    for (const it of items) for (const [name, steps] of versions(it)) expect(effectError(it, steps), `${it.id} ${name}`).toBeNull();
  });

  it('the own-turn items (and ★) are used once next to an enemy without an error', () => {
    const ownTurn = items.filter(
      (it) => it.use !== 'passive' && it.effect.every((st) => st.type !== 'special'),
    );
    expect(ownTurn.length).toBeGreaterThan(20);
    for (const it of ownTurn) {
      for (const id of it.upgrade ? [it.id, `${it.id}+`] : [it.id]) {
        const c = makeContent({ heroes: { alpha: fillerCards('alpha') }, spawns: [{ monster: 'rat', hex: [1, 2], rank: 'normal' }] });
        c.items = content.items;
        const setup = setupFor(c, ['alpha']);
        setup.heroes[0]!.items = [id];
        let s = createGame(setup, c);
        const rat = Object.values(s.figures).find((f) => f.kind === 'monster')!;
        const heroFig = s.figures['hero:alpha']!;
        heroFig.hex = firstFreeNeighbor({ s } as never, rat.hex)!;
        s = selectAll(s, c, { alpha: ['alpha.c1', 'alpha.c2'] });
        expect(s.pending?.kind, id).toBe('heroTurn');
        expect(() => act(s, c, { type: 'useItem', heroId: 'hero:alpha', itemId: id }), id).not.toThrow();
      }
    }
  });
});
