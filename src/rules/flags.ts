// Campaign flags inside a scenario (docs/design/act3.md, «Вузли вибору»: the secret missions).
//
//   The campaign's story flags come in with the setup (`GameSetup.flags`). A scenario's
//   `flagEffects` say what a flag changes there:
//   - `bossShield {boss, shield}`: the boss starts with that shield instead of its own
//     (`mirrors.aligned`: the Glass Guardian in s20 without its shield 2);
//   - `brokenObjects`: those objects are already broken when their room is revealed
//     (`bells.rung`: one fog loom in s15).

import type { Content, ScenarioDef } from './content';
import type { GameState } from './state';

type FlagEffect = NonNullable<ScenarioDef['flagEffects']>[number];

function effects(s: GameState, c: Content): FlagEffect[] {
  const flags = s.flags ?? [];
  return (c.scenarios[s.scenarioId]?.flagEffects ?? []).filter((e) => flags.includes(e.flag));
}

/** The boss's shield as a flag sets it, or undefined. */
export function flagBossShield(s: GameState, c: Content, typeId: string): number | undefined {
  let out: number | undefined;
  for (const e of effects(s, c)) if (e.bossShield?.boss === typeId) out = e.bossShield.shield;
  return out;
}

/** Whether a flag breaks the object before the scenario starts. */
export function brokenByFlag(s: GameState, c: Content, objectId: string): boolean {
  return effects(s, c).some((e) => e.brokenObjects?.includes(objectId));
}
