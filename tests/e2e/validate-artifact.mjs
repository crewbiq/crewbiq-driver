import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import Ajv2020 from 'ajv/dist/2020.js';

const artifactPath = process.argv[2] || 'artifacts/e2e/run.json';
const schemaPath = new URL('./schema/run-artifact.schema.json', import.meta.url);
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const artifact = JSON.parse(fs.readFileSync(path.resolve(artifactPath), 'utf8'));
const validate = new Ajv2020({ allErrors: true }).compile(schema);

if (!validate(artifact)) {
  console.error(JSON.stringify(validate.errors, null, 2));
  process.exitCode = 1;
} else {
  console.log(`validated CrewBIQ E2E artifact: ${artifactPath}`);
}
