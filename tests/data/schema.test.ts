import Ajv from 'ajv';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ajv = new Ajv({ allErrors: true, strict: false });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const read = (path: string): any => JSON.parse(readFileSync(path, 'utf8'));
const validator = (kind: string) => ajv.compile(read(join('data/schema', `${kind}.schema.json`)));

const kinds = ['heroes', 'monsters', 'bosses', 'decks', 'scenarios', 'items', 'battle-goals', 'perks', 'i18n'];

function files(kind: string): string[] {
  const dir = join('data', kind);
  const list = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
  if (existsSync(`data/${kind}.json`)) list.push(`data/${kind}.json`);
  return list;
}

describe('data files match their schemas', () => {
  for (const kind of kinds) {
    it(`${kind}: schema exists and every file is valid`, () => {
      expect(existsSync(join('data/schema', `${kind}.schema.json`))).toBe(true);
      const validate = validator(kind);
      const list = files(kind);
      expect(list.length).toBeGreaterThan(0);
      for (const path of list) {
        const ok = validate(read(path));
        expect(ok, `${path}: ${JSON.stringify(validate.errors?.slice(0, 3))}`).toBe(true);
      }
    });
  }
});

describe('schemas reject broken content', () => {
  it('unknown step type', () => {
    const hero = read('data/heroes/warden.json');
    hero.cards[0].top.steps[0].type = 'teleportBanana';
    expect(validator('heroes')(hero)).toBe(false);
  });

  it('unknown field on a step', () => {
    const hero = read('data/heroes/warden.json');
    hero.cards[0].top.steps[0].bogus = 1;
    expect(validator('heroes')(hero)).toBe(false);
  });

  it('unknown step type nested in a consume bonus', () => {
    const hero = read('data/heroes/warden.json');
    const card = hero.cards.find((c: { id: string }) => c.id === 'warden.earth-strike');
    card.bottom.steps[0].consume.then = [{ type: 'nope' }];
    expect(validator('heroes')(hero)).toBe(false);
  });

  it('unknown condition and orb', () => {
    const hero = read('data/heroes/warden.json');
    hero.cards[0].top.steps[0].conditions = ['sleepy'];
    expect(validator('heroes')(hero)).toBe(false);
    const hero2 = read('data/heroes/warden.json');
    hero2.classOrb = 'ice';
    expect(validator('heroes')(hero2)).toBe(false);
  });

  it('more than two monster fork cards', () => {
    const wolf = read('data/monsters/grey-wolf.json');
    wolf.forkCards.push({ ...wolf.forkCards[0], id: 'grey-wolf.third' });
    expect(validator('monsters')(wolf)).toBe(false);
  });

  it('conditional monster card needs both branches', () => {
    const wolf = read('data/monsters/grey-wolf.json');
    delete wolf.forkCards[1].otherwise;
    expect(validator('monsters')(wolf)).toBe(false);
  });

  it('spawn for an impossible hero count', () => {
    const s1 = read('data/scenarios/s1.json');
    s1.rooms[0].spawns[0].by['5'] = 'normal';
    expect(validator('scenarios')(s1)).toBe(false);
  });

  it('unknown goal type', () => {
    const s1 = read('data/scenarios/s1.json');
    s1.goal = { type: 'dance' };
    expect(validator('scenarios')(s1)).toBe(false);
  });
});
