// Regenerates docs/src/version.js from package.json's version.
// Runs automatically via the "version" npm script (npm version patch/minor/major).
import { readFileSync, writeFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const out = new URL('../docs/src/version.js', import.meta.url);
writeFileSync(out, `// Generated from package.json by scripts/sync-version.js - do not edit by hand.\nexport const VERSION = '${version}';\n`);
console.log(`version.js -> ${version}`);
