// «Всі іконки, всі позначення мають бути наші»: no emoji, dingbats or symbol glyphs anywhere in the
// game's code or texts. Icons come from src/ui/icons; in i18n texts they are `{icon:name}`.
// Typography stays allowed: − × … ≤ ≥ « » — – · ± and the like.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

/** Emoji and symbol blocks used as pictures: arrows, technical, geometric shapes, misc symbols, dingbats, … */
const BANNED = /[\p{Extended_Pictographic}←-⇿⌀-⏿①-⓿■-◿☀-➿⤀-⥿⬀-⯿•¢️⃣]/u;
/** Emoji proper are not allowed even in comments. */
const EMOJI = /[\p{Extended_Pictographic}️]/u;

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, ext));
    else if (ext.test(name)) out.push(p);
  }
  return out;
}

/** Source without comments (strings and template literals kept), so prose arrows in comments are fine. */
export function stripComments(src: string, css = false): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else if (!css && c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '"' || c === "'" || (!css && c === '`')) {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function offenders(text: string, re: RegExp): string[] {
  const found: string[] = [];
  text.split('\n').forEach((line, k) => {
    const m = line.match(new RegExp(re.source, 'gu'));
    if (m) found.push(`${k + 1}: ${[...new Set(m)].map((ch) => `${ch} U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase()}`).join(', ')}`);
  });
  return found;
}

describe('no emoji or symbol glyphs', () => {
  it('the scanner sees what it should', () => {
    expect(BANNED.test('⚔')).toBe(true);
    expect(BANNED.test('🛡')).toBe(true);
    expect(BANNED.test('★')).toBe(true);
    expect(BANNED.test('✓')).toBe(true);
    expect(BANNED.test('→')).toBe(true);
    expect(BANNED.test('▲')).toBe(true);
    expect(BANNED.test('−2 ×2 … ≤ «»')).toBe(false);
    expect(stripComments("// a → b\nconst x = '→'; /* ★ */")).toBe("\nconst x = '→'; ");
  });

  it('src/ code and styles', () => {
    const bad: string[] = [];
    for (const p of files(join(ROOT, 'src'), /\.(ts|css|html|svg)$/)) {
      const raw = readFileSync(p, 'utf8');
      const code = p.endsWith('.ts') ? stripComments(raw) : p.endsWith('.css') ? stripComments(raw, true) : raw;
      const lines = [...offenders(code, BANNED), ...offenders(raw, EMOJI)];
      if (lines.length) bad.push(`${relative(ROOT, p)}\n  ${[...new Set(lines)].join('\n  ')}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('data/i18n texts', () => {
    const bad: string[] = [];
    for (const p of files(join(ROOT, 'data', 'i18n'), /\.json$/)) {
      const table = JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
      for (const [key, text] of Object.entries(table)) if (BANNED.test(text)) bad.push(`${relative(ROOT, p)} ${key}: ${text}`);
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
