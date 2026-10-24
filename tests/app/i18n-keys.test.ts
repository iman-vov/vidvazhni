// Every literal i18n key the game screens use exists in all three languages.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGS, loadTranslations } from '../../src/rules/load';

const tables = loadTranslations();
const ROOTS = ['src/app', 'src/ui/game'];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('game screen texts', () => {
  const keys = new Set<string>();
  for (const f of ROOTS.flatMap(files)) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z][\w.-]*)'/g)) keys.add(m[1] as string);
  }

  it('finds the keys', () => {
    expect(keys.size).toBeGreaterThan(100);
  });

  it('has every key in uk, de and en', () => {
    const missing = [...keys].flatMap((k) => LANGS.filter((l) => !(k in tables[l])).map((l) => `${l}:${k}`));
    expect(missing).toEqual([]);
  });
});
