import { describe, expect, it } from 'vitest';
import type { Step } from '../../src/rules/content';
import { emptySelection, stepModel } from '../../src/ui/debug/stepPicker';
import { makeContent, newGame } from '../helpers/engineFixtures';

const NETTLE: Step = { type: 'attack', value: 3, consume: { element: 'fire', add: { value: 1 } } };
const RAT = 'monster:rat:1';

describe('stepModel consume', () => {
  const s = newGame(makeContent());

  it('a consume selection left over does not count when the element is not there (playtest #11)', () => {
    const m = stepModel(s, NETTLE, [{ targets: [RAT] }], { ...emptySelection(), consume: true });
    expect(m.consumeToggle).toBe(false);
    expect(m.consume).toBe(false);
  });

  it('with the element there, the toggle decides', () => {
    const all = [{ targets: [RAT] }, { targets: [RAT], consume: true }];
    expect(stepModel(s, NETTLE, all, emptySelection()).consume).toBe(false);
    expect(stepModel(s, NETTLE, all, { ...emptySelection(), consume: true })).toMatchObject({ consumeToggle: true, consume: true });
  });
});
