import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  throw new Error('Run this generator through `npm run sbom`.');
}

const generated = spawnSync(process.execPath, [
  npmExecPath,
  'sbom',
  '--omit=dev',
  '--sbom-format=spdx',
], {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (generated.status !== 0) {
  throw new Error(generated.stderr.trim() || `npm sbom exited with ${generated.status}.`);
}

const sbom = JSON.parse(generated.stdout);
const packagesById = new Map();
for (const packageEntry of sbom.packages || []) {
  if (!packagesById.has(packageEntry.SPDXID)) {
    packagesById.set(packageEntry.SPDXID, packageEntry);
  }
}
sbom.packages = [...packagesById.values()];

const relationshipsByKey = new Map();
for (const relationship of sbom.relationships || []) {
  const key = [
    relationship.spdxElementId,
    relationship.relationshipType,
    relationship.relatedSpdxElement,
  ].join('\u0000');
  if (!relationshipsByKey.has(key)) relationshipsByKey.set(key, relationship);
}
sbom.relationships = [...relationshipsByKey.values()];

const knownIds = new Set([
  sbom.SPDXID,
  ...sbom.packages.map((packageEntry) => packageEntry.SPDXID),
]);
const invalidRelationship = sbom.relationships.find((relationship) => (
  !knownIds.has(relationship.spdxElementId)
  || !knownIds.has(relationship.relatedSpdxElement)
));
if (invalidRelationship) {
  throw new Error(`SPDX relationship references an unknown element: ${JSON.stringify(invalidRelationship)}`);
}

await writeFile('SBOM.spdx.json', `${JSON.stringify(sbom, null, 2)}\n`, 'utf8');
process.stdout.write(
  `Wrote SBOM.spdx.json with ${sbom.packages.length} unique packages and ${sbom.relationships.length} relationships.\n`,
);
