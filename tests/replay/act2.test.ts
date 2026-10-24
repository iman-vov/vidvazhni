// Act II «Сиві гори» (docs/design/act2.md), s6–s10: the new monsters pass the content cross-checks,
// the card budget of tests/replay/card-budget.test.ts is estimated for a level-3 party (that file plays
// level 1), and a smoke run: each scenario set up for 2 heroes, the greedy bot plays a few rounds with
// no engine error. Maps, rooms and setup are covered by tests/data/scenarios-maps.test.ts.

import { describe, expect, it } from 'vitest';
import type { Content, ScenarioDef } from '../../src/rules/content';
import { apply, createGame } from '../../src/rules/engine';
import { hexKey, type Hex } from '../../src/rules/hex';
import { loadContent } from '../../src/rules/load';
import { goalZone } from '../../src/rules/objectives';
import { revealRoom } from '../../src/rules/setup';
import { BASE_RULES, FULL_FORK } from '../../src/rules/variants';
import { stepsFrom } from '../../tools/map-editor/checks';
import { checkContent } from '../data/crossref';
import { chooseAction } from './bot';

const content: Content = loadContent();
const ACT2 = ['s6', 's7', 's8', 's9', 's10'];
const scenarios: ScenarioDef[] = ACT2.map((id) => content.scenarios[id]!);
/** Bot rounds per smoke run: enough to reveal rooms and fight, short enough for the suite. */
const SMOKE_ROUNDS = 4;

/** Act II starts at hero level 3 (docs/design/act2.md «Прогрес»). */
const LEVEL = 3;
const PARTIES: Record<string, [string, string]> = {
  s6: ['rogue', 'tinker'],
  s7: ['wind-archer', 'warden'],
  s8: ['warden', 'herbalist'],
  s9: ['elementalist', 'rogue'],
  s10: ['warden', 'elementalist'],
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const handRounds = (cards: number) => {
  let rounds = 0;
  for (let c = cards; c >= 2; c--) rounds += Math.floor(c / 2);
  return rounds;
};
const meanStep = (classId: string, half: 'top' | 'bottom', type: 'attack' | 'move') =>
  mean(
    content.heroes[classId]!.cards.flatMap((card) =>
      card[half].steps.flatMap((st) => (st.type === type && 'value' in st && typeof st.value === 'number' ? [st.value] : [])),
    ),
  );

/** The estimate of tests/replay/card-budget.test.ts: walk + fight against the smallest hand. */
function budget(s: ScenarioDef) {
  const party = PARTIES[s.id]!;
  const game = createGame(
    {
      scenarioId: s.id,
      seed: 1,
      heroes: party.map((classId, i) => ({ classId, playerId: `p${i}`, level: LEVEL })),
      difficulty: 'normal',
      variants: { ...BASE_RULES },
    },
    content,
  );
  for (const room of s.rooms) revealRoom({ s: game, c: content, ev: [], out: [] }, s, room.id);
  let hp = Object.values(game.figures).reduce((n, f) => n + (f.kind === 'monster' ? f.maxHp : 0), 0);
  // Objects with hp count only when breaking them is the goal (s8 cages), not the optional ones (s10).
  const goalKind = s.goal.type === 'destroy' ? s.goal.kind : undefined;
  for (const o of s.rooms.flatMap((r) => r.objects ?? [])) if (o.kind === goalKind) hp += o.hp ?? 0;
  const from = stepsFrom(s, s.startHexes);
  const at = (h: Hex) => from.get(hexKey(h)) ?? Infinity;
  const spawns = s.rooms.flatMap((r) => (r.spawns ?? []).filter((sp) => sp.by['2']));
  const goal = s.goal;
  let walk: number;
  if (goal.type === 'carryItem') {
    const chest = s.rooms.flatMap((r) => r.chests ?? []).find((c) => c.loot?.questItem === goal.item)!;
    const back = stepsFrom(s, [chest.hex]);
    walk = at(chest.hex) + Math.min(...goalZone(s).map((h) => back.get(hexKey(h)) ?? Infinity));
  } else if (goal.type === 'escape' || goal.type === 'escort') walk = Math.min(...goalZone(s).map(at));
  else if (goal.type === 'killBoss') walk = Math.max(...spawns.filter((sp) => sp.monster === goal.boss).map((sp) => at(sp.hex)));
  else walk = Math.max(...spawns.map((sp) => at(sp.hex)));
  const move = mean(party.map((c) => meanStep(c, 'bottom', 'move')));
  const damage = party.reduce((n, c) => n + meanStep(c, 'top', 'attack'), 0);
  const min = Math.ceil(walk / move) + Math.ceil(hp / damage);
  const max = Math.min(...party.map((c) => handRounds(content.heroes[c]!.handSize)));
  return { walk, hp, min, max, slack: (max - min) / max };
}

describe('Act II data (s6–s10)', () => {
  it('the new monsters, boss and deck pass the content cross-checks', () => {
    expect(checkContent(content)).toEqual([]);
  });

  for (const s of scenarios) {
    it(`${s.id}: the hand outlasts the fewest rounds the goal takes by ≥25%`, () => {
      const b = budget(s);
      console.log(
        `[budget] ${s.id}: walk ${b.walk} steps, monster and object hp ${b.hp} → min ${b.min} rounds; ` +
          `hand allows ${b.max}; slack ${Math.round(b.slack * 100)}%`,
      );
      expect(Number.isFinite(b.walk)).toBe(true);
      expect(b.slack).toBeGreaterThanOrEqual(0.25);
    });
  }
});

describe('Act II smoke: the bot plays s6–s10 with 2 heroes', () => {
  for (const s of scenarios)
    for (const variants of [BASE_RULES, FULL_FORK])
      it(`${s.id} (${variants === FULL_FORK ? 'fork' : 'base'}): ${SMOKE_ROUNDS} bot rounds without an engine error`, () => {
        let g = createGame(
          {
            scenarioId: s.id,
            seed: 3,
            heroes: PARTIES[s.id]!.map((classId, i) => ({ classId, playerId: `p${i}`, level: LEVEL })),
            difficulty: 'normal',
            variants: { ...variants },
          },
          content,
        );
        let actions = 0;
        while (g.phase !== 'won' && g.phase !== 'lost' && g.round <= SMOKE_ROUNDS) {
          const r = apply(g, chooseAction(g, content), content);
          if (!r.ok) throw new Error(`${s.id} round ${g.round}: ${r.error}`);
          g = r.state;
          if (++actions > 2000) throw new Error(`${s.id}: the bot is stuck in round ${g.round}`);
        }
        expect(g.round > SMOKE_ROUNDS || g.phase === 'won' || g.phase === 'lost').toBe(true);
      }, 120_000);
});
