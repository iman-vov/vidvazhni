// Graphics quality: three levels that pick the model tier (assets/models/<id>/<id>{.low,,.hq}.glb)
// and the renderer settings. The player's choice is stored in localStorage; until they choose,
// the level is guessed from the device (see detectGraphicsQuality).

export type GraphicsQuality = 'low' | 'medium' | 'high';
export const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = ['low', 'medium', 'high'];

export interface RendererPreset {
  /** Upper bound for renderer.setPixelRatio (the device ratio is used when lower). */
  maxPixelRatio: number;
  /** Takes effect only when a renderer is created (WebGL fixes it at context creation). */
  antialias: boolean;
  /** Which models cast shadows: none, heroes only, figures and the props on the hexes, or every
   *  model including the walls and props around the board. */
  shadows: 'none' | 'heroes' | 'figures' | 'all';
  shadowMapSize: number;
}

export const RENDERER_PRESETS: Record<GraphicsQuality, RendererPreset> = {
  low: { maxPixelRatio: 1, antialias: false, shadows: 'none', shadowMapSize: 0 },
  medium: { maxPixelRatio: 1.5, antialias: true, shadows: 'figures', shadowMapSize: 1024 },
  high: { maxPixelRatio: 2, antialias: true, shadows: 'all', shadowMapSize: 2048 },
};

const STORAGE_KEY = 'vidvazhni.graphicsQuality';
const listeners = new Set<(q: GraphicsQuality) => void>();
let detected: GraphicsQuality | null = null;

function isQuality(value: unknown): value is GraphicsQuality {
  return typeof value === 'string' && (GRAPHICS_QUALITIES as readonly string[]).includes(value);
}

/** The player's stored choice, or null if they have not chosen (or storage is unavailable). */
export function storedGraphicsQuality(): GraphicsQuality | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isQuality(value) ? value : null;
  } catch {
    return null;
  }
}

/** The level in effect: the stored choice, else the device guess. */
export function getGraphicsQuality(): GraphicsQuality {
  return storedGraphicsQuality() ?? (detected ??= detectGraphicsQuality(readDeviceInfo()));
}

/** Stores the choice (null forgets it and returns to the device guess) and notifies listeners. */
export function setGraphicsQuality(quality: GraphicsQuality | null): void {
  try {
    if (quality) localStorage.setItem(STORAGE_KEY, quality);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode or blocked storage: the choice lasts until reload.
    if (quality) detected = quality;
  }
  const now = getGraphicsQuality();
  for (const cb of listeners) cb(now);
}

/** Calls cb whenever the level changes. Returns an unsubscribe function. */
export function onGraphicsQualityChange(cb: (q: GraphicsQuality) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function rendererPreset(quality = getGraphicsQuality()): RendererPreset {
  return RENDERER_PRESETS[quality];
}

/** Whether a model of this manifest kind casts shadows under the preset. */
export function castsShadow(preset: RendererPreset, kind: string): boolean {
  if (preset.shadows === 'all') return true;
  if (preset.shadows === 'figures') return kind === 'hero' || kind === 'monster' || kind === 'prop';
  return preset.shadows === 'heroes' && kind === 'hero';
}

export interface DeviceInfo {
  /** UNMASKED_RENDERER_WEBGL, or the plain RENDERER string when unmasking is blocked. */
  gpu: string;
  maxTextureSize: number;
  /** navigator.hardwareConcurrency (Safari reports a capped value). */
  cores: number;
  /** navigator.deviceMemory in GB (Chromium only, capped at 8), or null. */
  memoryGb: number | null;
  /** navigator.maxTouchPoints > 0: tablets and phones; Macs and most PCs report 0. */
  touch: boolean;
  userAgent: string;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic/i;
const MOBILE_GPU = /adreno|mali|powervr|immortalis|xclipse|apple gpu|apple a\d|videocore|tegra/i;
/** Android GPUs of roughly 2021 flagships on: Adreno 7xx/8xx, Mali-G77/G78/G7xx/G9xx, Immortalis, Xclipse. */
const FLAGSHIP_MOBILE_GPU = /adreno \(tm\) [78]\d\d|mali-g7[78](?!\d)|mali-g[79]\d\d|immortalis|xclipse/i;
/** Older Intel integrated GPUs (HD/UHD Graphics). Iris Xe and Arc handle the high tier. */
const INTEGRATED_GPU = /intel.*\b(hd|uhd) graphics/i;

/**
 * Guesses the level from the device:
 * - software rendering → low;
 * - no touch screen and a non-mobile GPU (desktop or laptop, Steam Machine) → high,
 *   except older Intel HD/UHD graphics, under 4 cores or textures under 8192 px → medium
 *   (Intel Iris Xe laptops, like the family PC, get high);
 * - iPad/iPhone (Apple GPU with touch, or an iOS user agent) → medium, since A16-class and newer
 *   iPads run it well and WebKit hides the exact GPU;
 * - Android with a flagship GPU (Adreno 7xx+, Mali-G7xx, Immortalis, Xclipse) and ≥ 8 GB → medium;
 * - everything else, including unknown touch devices → low (the mid-range Android tablet target).
 * The player can always override it in settings.
 */
export function detectGraphicsQuality(d: DeviceInfo): GraphicsQuality {
  if (SOFTWARE_GPU.test(d.gpu)) return 'low';
  const ios = /iPad|iPhone|iPod/.test(d.userAgent) || (d.touch && /Macintosh/.test(d.userAgent));
  if (!d.touch && !ios && !MOBILE_GPU.test(d.gpu)) {
    if (INTEGRATED_GPU.test(d.gpu) || d.cores < 4 || d.maxTextureSize < 8192) return 'medium';
    return 'high';
  }
  if (ios || /apple/i.test(d.gpu)) return 'medium';
  if (FLAGSHIP_MOBILE_GPU.test(d.gpu) && (d.memoryGb ?? 0) >= 8) return 'medium';
  return 'low';
}

/** Reads DeviceInfo in the browser; outside one (tests, SSR) it describes an unknown touch device. */
export function readDeviceInfo(): DeviceInfo {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const info: DeviceInfo = {
    gpu: '',
    maxTextureSize: 0,
    cores: nav?.hardwareConcurrency ?? 0,
    memoryGb: (nav as { deviceMemory?: number } | undefined)?.deviceMemory ?? null,
    touch: (nav?.maxTouchPoints ?? 1) > 0,
    userAgent: nav?.userAgent ?? '',
  };
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      info.gpu = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      info.maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // No DOM or no WebGL: keep the defaults.
  }
  return info;
}
