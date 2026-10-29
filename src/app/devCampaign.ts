// Dev-server-only shortcut to a campaign mid-way, for walking later acts in the real UI:
// `?campaign=act3` = s1–s10 won (Act II by s6), heroes at level 5 with XP for level 6.
// Options: `&after=s11,s12` wins more scenarios on top (in order), `&level=6`, `&heroes=warden,rogue`,
// `&secondary=s11.none-exhausted` counts these secondary goals as met. Not in production builds.

import { applyScenarioResult, newCampaign, type CampaignState } from '../rules/campaign';
import type { LoadedContent as Content } from '../rules/load';
import type { PlayerInfo } from './game';
import type { CampaignStorage } from './storage';

const ACT_PATHS: Record<string, string[]> = {
  act2: ['s1', 's2', 's3', 's4', 's5'],
  act3: ['s1', 's2', 's3', 's4', 's5', 's6', 's8', 's9', 's10'],
};

export function devCampaign(content: Content, params: URLSearchParams): { state: CampaignState; players: PlayerInfo[] } | null {
  const path = ACT_PATHS[params.get('campaign') ?? ''];
  if (!path) return null;
  const heroes = (params.get('heroes') ?? 'warden,herbalist').split(',').filter((id) => content.heroes[id]);
  const players = heroes.map((_, i) => ({ id: `p${i + 1}`, name: `Гравець ${i + 1}` }));
  let state = newCampaign(content, { players: players.map((p) => p.id), heroes: heroes.map((classId, i) => ({ classId, playerId: `p${i + 1}` })) });
  const met = new Set((params.get('secondary') ?? '').split(','));
  const wins = [...path, ...(params.get('after') ?? '').split(',').filter(Boolean)];
  for (const [i, scenarioId] of wins.entries()) {
    const sc = content.scenarios[scenarioId];
    if (!sc) break;
    const r = applyScenarioResult(content, state, {
      id: `dev-${i}`,
      scenarioId,
      won: true,
      heroes: heroes.map((classId) => ({ classId, xp: 0, gold: sc.reward.goldEach ?? 0 })),
      secondaryMet: (sc.secondary ?? []).filter((g) => met.has(g.id)).map((g) => g.id),
    });
    if (!r.ok) break;
    state = r.state;
  }
  // Level N with one level card per level 2…N and XP for the next level, so the camp offers it.
  const level = Math.max(1, Math.min(content.campaign.xpByLevel.length, Number(params.get('level') ?? 5)));
  for (const h of state.heroes) {
    const cards = content.heroes[h.classId]?.cards ?? [];
    h.level = level;
    h.xp = content.campaign.xpByLevel[level] ?? content.campaign.xpByLevel[level - 1] ?? 0;
    h.cardPool = Array.from({ length: level - 1 }, (_, i) => cards.find((c) => c.level === i + 2)?.id).filter((id): id is string => !!id);
    delete h.handPick;
  }
  return { state, players };
}

/** Writes the shortcut campaign over the saved one; true when the URL asked for it. */
export function installDevCampaign(content: Content, campaigns: CampaignStorage): boolean {
  const built = devCampaign(content, new URLSearchParams(location.search));
  if (!built) return false;
  campaigns.save(built.state, built.players);
  // A reload then keeps the progress made from here instead of building the save again.
  history.replaceState(null, '', location.pathname);
  return true;
}
