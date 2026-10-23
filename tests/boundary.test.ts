import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('rules module boundary', () => {
  it('src/rules imports nothing from three.js, the DOM layers or Math.random', () => {
    for (const path of files('src/rules')) {
      const text = readFileSync(path, 'utf8');
      expect(text, path).not.toMatch(/from ['"]three/);
      expect(text, path).not.toMatch(/from ['"]\.\.\/(render|ui|app|net|storage)/);
      expect(text, path).not.toMatch(/Math\.random\(/);
      expect(text, path).not.toMatch(/\b(document|window)\./);
    }
  });
});
