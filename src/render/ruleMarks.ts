// What the board marks for the Act III scenario rules (docs/design/act3.md, «Нові правила»), read
// from the state alone: tinted and outlined hexes, small chips over hexes and figures, and links
// between hexes. ruleMarkLayer.ts draws them; the look keeps to the board's marker language (flat
// hex decals like the terrain overlays, chips like the event countdown over a figure).
//
//   deepWater (s11)    deep hexes: dark water with a pale ring (a well); a soaked figure: «−1 move».
//   fogBanks (s12)     fog hexes: a pale cloud that hides the floor; cleared by Fire or Air: faint.
//   fireflyPond (s13)  the pond's hexes outlined in firefly gold; the fireflies left on a chip.
//   risingWater (s14)  the row that floods next: a blue tint and outline, rounds until it floods.
//   fogLooms (s15)     a thread from each standing loom to the Queen; her ranged-attack mark.
//   mirrorHexes (s16)  a mirror's hex shines pale blue; a broken one turns grey.
//   automatonHelpers / livingBooks (s17, s18)  «Zz» over sleepers and sleeping shelves; an awake
//                      shelf red with «!»; an unturned wind-up key gold.
//   beamMirrors (s19)  the hexes the beam lights are gold; a turning mirror shows ✓ or «turn me».
//   allyPhase (s20)    a monster that changed sides wears the heroes' mark; the heart while it is
//                      kept: its health and the rounds left.

import type { Content, ScenarioDef } from '../rules/content';
import { hexKey, parseHexKey, type Hex } from '../rules/hex';
import { floodedRows, LOOM } from '../rules/marsh';
import { beamPath, MIRROR, MIRROR_BROKEN } from '../rules/mirrors';
import { activeGoal, counterLeft, goalZone, objectiveStatus } from '../rules/objectives';
import { BOOKSHELF, SHELF_ASLEEP, SHELF_AWAKE } from '../rules/books';
import { WIND_UP_KEY } from '../rules/allies';
import type { Figure, FigureId, GameState } from '../rules/state';
import type { IconName } from '../ui/icons/names';

export type HexTone = 'deep' | 'fog' | 'fogClear' | 'flood' | 'pond' | 'mirror' | 'broken' | 'lit' | 'key' | 'asleep' | 'awake' | 'heart';
export type ChipTone = 'blue' | 'gold' | 'violet' | 'red' | 'green' | 'grey';

export interface HexMark {
  hex: Hex;
  tone: HexTone;
}

export interface Chip {
  icon?: IconName;
  text: string;
  tone: ChipTone;
  /** The icon crossed out (ranged attacks hindered). */
  crossed?: boolean;
}

export interface HexChip extends Chip {
  hex: Hex;
  /** Height over the floor in hexes (over a tall prop it sits higher). */
  lift: number;
}

export interface RuleMarks {
  hexes: HexMark[];
  chips: HexChip[];
  tags: Map<FigureId, Chip[]>;
  /** Threads on the floor from hex to hex (fog looms to the Queen). */
  links: [Hex, Hex][];
}

const has = (scenario: ScenarioDef | undefined, special: string) => !!scenario?.specials?.includes(special);

/** Whether `f` is the figure whose turn it is. */
function acting(s: GameState, f: Figure): boolean {
  if (s.phase !== 'turns') return false;
  const e = s.turnOrder[s.turnIndex];
  if (!e) return false;
  return e.kind === 'monsterGroup' ? f.kind === 'monster' && f.typeId === e.typeId : e.figureId === f.id;
}

export function ruleMarks(s: GameState, c: Content): RuleMarks {
  const out: RuleMarks = { hexes: [], chips: [], tags: new Map(), links: [] };
  const scenario = c.scenarios[s.scenarioId];
  if (!scenario) return out;
  const tag = (id: FigureId, chip: Chip) => {
    const list = out.tags.get(id) ?? [];
    list.push(chip);
    out.tags.set(id, list);
  };
  const objects: { hex: Hex; id: string; kind: string; state?: string }[] = [];

  for (const [k, t] of Object.entries(s.board.tiles)) {
    const hex = parseHexKey(k);
    if (t.terrain === 'deep') out.hexes.push({ hex, tone: 'deep' });
    if (t.terrain === 'fog') out.hexes.push({ hex, tone: (t.fogClearedUntil ?? 0) >= s.round ? 'fogClear' : 'fog' });
    if (t.object) objects.push({ hex, id: t.object.id, kind: t.object.kind, ...(t.object.state !== undefined ? { state: t.object.state } : {}) });
  }

  // Figures: soaked (the next turn moves 1 less), asleep, an ally that was a monster.
  for (const f of Object.values(s.figures)) {
    if (f.hp <= 0) continue;
    if (f.soakedTurn !== undefined && (f.soakedTurn > f.turnCount || (f.soakedTurn === f.turnCount && acting(s, f)))) tag(f.id, { icon: 'move', text: '−1', tone: 'blue' });
    if (f.kind === 'monster' && f.asleep) tag(f.id, { text: 'Zz', tone: 'violet' });
    if (f.kind === 'summon' && f.monsterType && f.npc?.fights) tag(f.id, { icon: 'hero', text: '', tone: 'green' });
  }

  // s13: the pond and the fireflies still alight.
  const goal = activeGoal(s, scenario);
  if (has(scenario, 'fireflyPond') && goal.type === 'defend' && goal.counter) {
    const zone = goalZone(scenario, goal).filter((h) => s.board.tiles[hexKey(h)]);
    for (const hex of zone) out.hexes.push({ hex, tone: 'pond' });
    const mid = centre(zone);
    if (mid) out.chips.push({ hex: mid, icon: 'light', text: `${counterLeft(s, goal)}/${goal.counter}`, tone: 'gold', lift: 0.35 });
  }

  // s14: the row the water takes next, and in how many rounds.
  const rising = scenario.rising;
  if (has(scenario, 'risingWater') && rising && s.phase !== 'won' && s.phase !== 'lost') {
    const n = floodedRows(rising, s.round);
    const row = rising.rows[n]?.filter((h) => s.board.tiles[hexKey(h)]);
    if (row?.length) {
      const at = n === 0 ? rising.from : rising.from + n * rising.every;
      for (const hex of row) out.hexes.push({ hex, tone: 'flood' });
      out.chips.push({ hex: row[Math.floor(row.length / 2)]!, icon: 'up', text: String(Math.max(1, at - s.round)), tone: 'blue', lift: 0.35 });
    }
  }

  // s15: a thread from every standing loom to the Queen, who is hard to hit from afar.
  if (has(scenario, 'fogLooms')) {
    const boss = Object.values(s.figures).find((f) => f.kind === 'monster' && f.rank === 'boss' && f.hp > 0);
    const looms = objects.filter((o) => o.kind === LOOM);
    if (boss && looms.length) {
      for (const o of looms) out.links.push([o.hex, boss.hex]);
      tag(boss.id, { icon: 'ranged', text: String(looms.length), tone: 'violet', crossed: true });
    }
  }

  // s16, s19: mirrors.
  const beam = beamPath(s, scenario);
  const goalStates = new Map(goal.type === 'objectStates' ? goal.objects.map((o) => [o.id, o.state] as const) : []);
  for (const o of objects) {
    if (o.kind === MIRROR) {
      const turning = !!scenario.rooms.some((r) => r.objects?.some((d) => d.id === o.id && d.turns?.length));
      if (o.state === MIRROR_BROKEN) out.hexes.push({ hex: o.hex, tone: 'broken' });
      else if (beam?.lit.includes(o.id)) out.hexes.push({ hex: o.hex, tone: 'lit' });
      else if (!turning) out.hexes.push({ hex: o.hex, tone: 'mirror' });
      if (turning && o.state !== MIRROR_BROKEN) {
        const done = goalStates.get(o.id) === o.state;
        out.chips.push({ hex: o.hex, icon: done ? 'check' : 'rotate', text: '', tone: done ? 'green' : 'gold', lift: 1.15 });
      }
    }
    // s17: a wind-up key not turned yet.
    if (o.kind === WIND_UP_KEY && has(scenario, 'automatonHelpers') && o.state !== 'on') {
      out.hexes.push({ hex: o.hex, tone: 'key' });
      out.chips.push({ hex: o.hex, icon: 'lever', text: '', tone: 'gold', lift: 0.9 });
    }
    // s18: living shelves, asleep or raising the alarm.
    if (o.kind === BOOKSHELF && has(scenario, 'livingBooks')) {
      if (o.state === SHELF_ASLEEP) {
        out.hexes.push({ hex: o.hex, tone: 'asleep' });
        out.chips.push({ hex: o.hex, text: 'Zz', tone: 'violet', lift: 1.2 });
      } else if (o.state === SHELF_AWAKE) {
        out.hexes.push({ hex: o.hex, tone: 'awake' });
        out.chips.push({ hex: o.hex, text: '!', tone: 'red', lift: 1.2 });
      }
    }
  }

  // s20: the heart while the goal keeps it, with its health and the rounds left.
  if (has(scenario, 'allyPhase') && goal.type === 'protect') {
    const heart = objects.find((o) => o.id === goal.object);
    const b = heart && s.board.tiles[hexKey(heart.hex)]?.breakable;
    if (heart) {
      out.hexes.push({ hex: heart.hex, tone: 'heart' });
      if (b) out.chips.push({ hex: heart.hex, icon: 'hp', text: `${b.hp}/${b.maxHp}`, tone: 'red', lift: 1.15 });
      const st = objectiveStatus(c, s);
      const left = st?.of !== undefined ? st.of - (st.done ?? 0) : undefined;
      if (left !== undefined) out.chips.push({ hex: heart.hex, icon: 'defend-point', text: String(left), tone: 'gold', lift: 0.25 });
    }
  }
  return out;
}

/** The zone's hex nearest its middle. */
function centre(zone: readonly Hex[]): Hex | null {
  if (!zone.length) return null;
  const q = zone.reduce((t, h) => t + h[0], 0) / zone.length;
  const r = zone.reduce((t, h) => t + h[1], 0) / zone.length;
  return [...zone].sort((a, b) => (a[0] - q) ** 2 + (a[1] - r) ** 2 - ((b[0] - q) ** 2 + (b[1] - r) ** 2))[0]!;
}
