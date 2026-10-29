// The location data in data/environments/*.json, by scenario. A scenario without a location of its
// own gets the generic stone room, so every map has something around it.

import type { EnvironmentDef } from './types';

// Vitest's fsModuleCache (node_modules/.vitest-cache) keys this module on its text, not on what the
// glob finds: after adding or removing a location file, run vitest once with --fsModuleCache=false.
const FILES = import.meta.glob<EnvironmentDef>('/data/environments/*.json', { eager: true, import: 'default' });

export const ENVIRONMENTS: EnvironmentDef[] = Object.values(FILES).sort((a, b) => a.id.localeCompare(b.id));

export const DEFAULT_ENVIRONMENT: EnvironmentDef = {
  id: 'default',
  scenarios: [],
  edge: 'stone',
  ground: { texture: 'cobblestone', tint: '#6a625a' },
  walls: { height: 1.5, low: 0.3, alt: 0 },
  light: { sky: '#fff3dc', ground: '#2c2836', hemi: 1.1, sun: '#fff1d8', sunIntensity: 2.0 },
  fog: { color: '#1b1d27', start: 2.6, end: 8, morok: '#aab0bd', morokOpacity: 0.4 },
  propModels: {
    barrel: { model: 'barrel', height: 0.92 },
    crate: { model: 'crate', height: 0.62 },
    chest: { model: 'chest', height: 0.6 },
    door: { model: 'dungeon-door', height: 1.0 },
    trap: { model: 'bear-trap', height: 0.18 },
    cage: { model: 'prisoner-cage', height: 1.1 },
    totem: { model: 'tribal-totem', height: 1.5 },
    crystal: { model: 'crystal-cluster', height: 0.7 },
  },
  dressing: { ring: [['barrel', 2], ['crate', 2], ['sack', 1]], density: 0.5 },

};

export function environmentFor(scenarioId: string): EnvironmentDef {
  const def = ENVIRONMENTS.find((e) => e.scenarios.includes(scenarioId)) ?? DEFAULT_ENVIRONMENT;
  const own = def.byScenario?.[scenarioId];
  return own?.propModels ? { ...def, propModels: { ...def.propModels, ...own.propModels } } : def;
}
