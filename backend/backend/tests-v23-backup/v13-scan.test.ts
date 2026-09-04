import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v13 CI has browser E2E and healthcheck coverage', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const server = await readFile(new URL('../src/server.ts', import.meta.url), 'utf8');
  assert.equal(typeof pkg.scripts.e2e, 'string');
  assert.match(server, /\/api\/health/);
  assert.match(server, /setErrorHandler/);
});

test('v13 Docker image is prepared for production health checks', async () => {
  const docker = await readFile(new URL('../Dockerfile', import.meta.url), 'utf8');
  const compose = await readFile(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(docker, /USER node/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /condition: service_healthy/);
});
