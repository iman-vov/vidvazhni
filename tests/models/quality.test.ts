// The graphics-quality guess for the devices the family plays on, plus a few edge cases.

import { describe, expect, it } from 'vitest';
import { castsShadow, detectGraphicsQuality, RENDERER_PRESETS, type DeviceInfo } from '../../src/render/quality';

const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36';

const device = (d: Partial<DeviceInfo>): DeviceInfo => ({
  gpu: '',
  maxTextureSize: 16384,
  cores: 8,
  memoryGb: 8,
  touch: false,
  userAgent: WINDOWS,
  ...d,
});

describe('detectGraphicsQuality', () => {
  it('gives high to desktop GPUs, including the family PC with Intel Iris Xe', () => {
    expect(detectGraphicsQuality(device({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' }))).toBe('high');
    expect(detectGraphicsQuality(device({ gpu: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)' }))).toBe('high');
    expect(detectGraphicsQuality(device({ gpu: 'AMD Custom GPU 0405 (radeonsi, vangogh, LLVM 17.0.6, DRM 3.54)', userAgent: 'X11; Linux x86_64' }))).toBe('high');
  });

  it('gives medium to old Intel HD/UHD graphics and weak desktops', () => {
    expect(detectGraphicsQuality(device({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' }))).toBe('medium');
    expect(detectGraphicsQuality(device({ gpu: 'ANGLE (NVIDIA, GeForce GT 710)', cores: 2 }))).toBe('medium');
  });

  it('gives medium to iPads (Safari reports a Mac user agent with touch)', () => {
    expect(detectGraphicsQuality(device({ gpu: 'Apple GPU', touch: true, userAgent: IPAD, memoryGb: null, cores: 4 }))).toBe('medium');
  });

  it('gives medium to flagship Android tablets with 8 GB, low to the rest', () => {
    expect(detectGraphicsQuality(device({ gpu: 'Adreno (TM) 740', touch: true, userAgent: ANDROID }))).toBe('medium');
    expect(detectGraphicsQuality(device({ gpu: 'Mali-G57 MC2', touch: true, userAgent: ANDROID, memoryGb: 4 }))).toBe('low');
    expect(detectGraphicsQuality(device({ gpu: 'Mali-G72 MP3', touch: true, userAgent: ANDROID, memoryGb: 8 }))).toBe('low');
    expect(detectGraphicsQuality(device({ gpu: 'Adreno (TM) 740', touch: true, userAgent: ANDROID, memoryGb: 4 }))).toBe('low');
    expect(detectGraphicsQuality(device({ gpu: '', touch: true, userAgent: ANDROID, memoryGb: null }))).toBe('low');
  });

  it('gives low to software rendering', () => {
    expect(detectGraphicsQuality(device({ gpu: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)' }))).toBe('low');
  });
});

describe('renderer presets', () => {
  it('grow with the level', () => {
    expect(RENDERER_PRESETS.low).toMatchObject({ maxPixelRatio: 1, antialias: false, shadows: 'none' });
    expect(RENDERER_PRESETS.medium).toMatchObject({ maxPixelRatio: 1.5, antialias: true, shadows: 'heroes' });
    expect(RENDERER_PRESETS.high.maxPixelRatio).toBe(2);
    expect(RENDERER_PRESETS.high.shadowMapSize).toBeGreaterThan(RENDERER_PRESETS.medium.shadowMapSize);
  });

  it('cast shadows from heroes only on medium', () => {
    expect(castsShadow(RENDERER_PRESETS.medium, 'hero')).toBe(true);
    expect(castsShadow(RENDERER_PRESETS.medium, 'monster')).toBe(false);
    expect(castsShadow(RENDERER_PRESETS.high, 'monster')).toBe(true);
    expect(castsShadow(RENDERER_PRESETS.low, 'hero')).toBe(false);
  });
});
