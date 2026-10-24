import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGS, loadTranslations } from '../../src/rules/load';
import { iconHtml, plain } from '../../src/ui/icons';
import { ICON_GROUPS, ICON_NAMES, isIconName } from '../../src/ui/icons/names';
import { iconFiles, iconInner, iconSvg } from '../../src/ui/icons/svg';

const SVG_DIR = join(__dirname, '..', '..', 'src', 'ui', 'icons', 'svg');
const read = (name: string) => readFileSync(join(SVG_DIR, `${name}.svg`), 'utf8');

describe('icon set', () => {
  it('every name has a file and every file a name', () => {
    expect(iconFiles()).toEqual([...ICON_NAMES].sort());
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it('has the icons the design asks for (art/prompts/ui icon-sheet)', () => {
    const need = [
      'attack', 'ranged', 'range', 'targets', 'move', 'jump', 'fly', 'heal', 'shield', 'retaliate', 'push', 'pull', 'loot', 'initiative', 'loss', 'xp', 'momentum', 'bless', 'curse', 'area',
      'poison', 'wound', 'immobilize', 'disarm', 'stun', 'muddle', 'invisible', 'strengthen',
      'fire', 'ice', 'air', 'earth', 'light', 'dark', 'orb-fire', 'orb-earth', 'orb-air',
      'door', 'trap', 'chest', 'coin', 'hp',
    ];
    for (const n of need) expect(isIconName(n), n).toBe(true);
    expect(ICON_GROUPS.conditions).toHaveLength(8);
  });

  it('files follow the style contract: 24×24, currentColor body, one accent through --icon-line', () => {
    for (const name of ICON_NAMES) {
      const svg = read(name);
      expect(svg, name).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24">/);
      expect(svg, name).toContain('currentColor');
      const colours = svg.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? [];
      // The only literal colour is the fallback of var(--icon-line, …).
      expect(new Set(colours), name).toEqual(new Set(['#3a2414']));
      expect(svg.match(/var\(--[\w-]+/g)?.every((v) => v === 'var(--icon-line'), name).toBe(true);
      expect(svg, name).not.toMatch(/<(text|image|script|use)\b/);
    }
  });

  it('no two icons share their drawing', () => {
    const seen = new Map<string, string>();
    for (const name of ICON_NAMES) {
      const inner = iconInner(name);
      expect(seen.get(inner), `${name} = ${seen.get(inner)}`).toBeUndefined();
      seen.set(inner, name);
    }
  });

  it('every icon has a label in uk, de and en', () => {
    const tables = loadTranslations();
    for (const lang of LANGS) for (const name of ICON_NAMES) expect(tables[lang][`icon.${name}`], `${lang} icon.${name}`).toBeTruthy();
  });

  it('builds inline markup with an i18n aria-label', () => {
    const html = iconHtml('attack', { size: 32 });
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('width="32"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Атака ближня"');
    expect(iconHtml('move', { title: false })).toContain('aria-hidden="true"');
    expect(iconSvg('coin', { title: 'a"b' })).toContain('aria-label="a&quot;b"');
  });

  it('plain() turns placeholders into words for titles and logs', () => {
    expect(plain('Атака 3 {icon:arrow} 5')).toBe('Атака 3 – 5');
    expect(plain('{icon:fire} і {icon:nope}')).toBe('Вогонь і {icon:nope}');
  });

  it('i18n placeholders name real icons', () => {
    const tables = loadTranslations();
    for (const lang of LANGS) {
      for (const [key, text] of Object.entries(tables[lang])) {
        for (const m of text.matchAll(/\{icon:([^}]*)\}/g)) expect(isIconName(m[1] as string), `${lang} ${key}`).toBe(true);
      }
    }
  });
});
