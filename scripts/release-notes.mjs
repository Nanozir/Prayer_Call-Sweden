// Prints the CHANGELOG.md section for one version, used as GitHub release text.
import { readFileSync } from 'node:fs';

const version = process.argv[2];
const text = readFileSync('CHANGELOG.md', 'utf8');
const start = text.indexOf(`## [${version}]`);
if (start < 0) {
  console.error(`CHANGELOG.md saknar en rubrik för version ${version}`);
  process.exit(1);
}
const rest = text.slice(start);
const next = rest.indexOf('\n## [', 1);
console.log((next < 0 ? rest : rest.slice(0, next)).split('\n').slice(1).join('\n').trim());
