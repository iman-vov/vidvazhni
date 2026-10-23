// Validates every JSON file in data/<kind>/ against data/schema/<kind>.schema.json.
// Broken content fails the build instead of the game.
import Ajv from 'ajv';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ajv = new Ajv({ allErrors: true, strict: false });
const schemaDir = 'data/schema';
let failed = 0;
let checked = 0;

for (const file of existsSync(schemaDir) ? readdirSync(schemaDir) : []) {
  if (!file.endsWith('.schema.json')) continue;
  const kind = file.replace('.schema.json', '');
  const validate = ajv.compile(JSON.parse(readFileSync(join(schemaDir, file), 'utf8')));
  const dir = join('data', kind);
  const targets = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
  if (existsSync(`data/${kind}.json`)) targets.push(`data/${kind}.json`);
  for (const path of targets) {
    checked++;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (!validate(data)) {
      failed++;
      console.error(`✗ ${path}`);
      for (const e of validate.errors ?? []) console.error(`   ${e.instancePath || '/'} ${e.message}`);
    }
  }
}

if (failed) {
  console.error(`${failed} data file(s) invalid`);
  process.exit(1);
}
console.log(`data ok (${checked} files)`);
