// Campaign map (data/campaign-map.json): which mission markers and route lines the map shows for a
// campaign state. Pure functions — the screen is src/app/screens/campaignMap.ts.

import type { CampaignState } from './campaign';

export type MapRegion = 'alba' | 'forest' | 'mountains' | 'marshes' | 'glass' | 'gloom';

export interface MapMarker {
  id: string;
  /** Position as a fraction of the map art (0..1). */
  x: number;
  y: number;
  region: MapRegion;
  /** Choice node and option (`c1:mine`, docs/design/story.md «Вузли вибору»). */
  branch?: string;
}

export interface CampaignMapDef {
  image: { width: number; height: number };
  markers: MapMarker[];
  links: [string, string][];
}

/** completed · available (can start) · locked (another option of its choice was taken) ·
 *  unknown (a «?» right after a won mission) · hidden. */
export type MarkerState = 'completed' | 'available' | 'locked' | 'unknown' | 'hidden';

/** done (both won) · open (won → available, highlighted) · closed (won → locked, grey) · hint (won → «?»). */
export type RouteState = 'done' | 'open' | 'closed' | 'hint' | 'hidden';

const node = (branch?: string) => branch?.split(':')[0];

export function markerStates(map: CampaignMapDef, s: CampaignState): Record<string, MarkerState> {
  const reached = new Set([...s.completed, ...s.unlocked]);
  // Options taken per choice node: an option counts once any of its slots is won or open.
  const taken = new Map<string, Set<string>>();
  for (const m of map.markers) {
    if (!m.branch || !reached.has(m.id)) continue;
    const [n = '', opt = ''] = m.branch.split(':');
    if (!taken.has(n)) taken.set(n, new Set());
    taken.get(n)?.add(opt);
  }
  const out: Record<string, MarkerState> = {};
  for (const m of map.markers) {
    if (s.completed.includes(m.id)) out[m.id] = 'completed';
    else if (s.unlocked.includes(m.id)) out[m.id] = 'available';
    else {
      const opts = taken.get(node(m.branch) ?? '');
      const opt = m.branch?.split(':')[1] ?? '';
      if (opts && !opts.has(opt)) out[m.id] = 'locked';
      else out[m.id] = map.links.some(([a, b]) => b === m.id && s.completed.includes(a)) ? 'unknown' : 'hidden';
    }
  }
  return out;
}

export function routeStates(map: CampaignMapDef, markers: Record<string, MarkerState>): RouteState[] {
  return map.links.map(([a, b]) => {
    if (markers[a] !== 'completed') return 'hidden';
    switch (markers[b]) {
      case 'completed':
        return 'done';
      case 'available':
        return 'open';
      case 'locked':
        return 'closed';
      case 'unknown':
        return 'hint';
      default:
        return 'hidden';
    }
  });
}
