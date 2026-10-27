import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { copyFixture, generateInto } from './helpers.mjs';

let server;
let baseUrl;
let out;

before(async () => {
  const project = copyFixture();
  await generateInto(project, ['--targets', 'server']);
  out = path.join(project, 'mock-server');
  server = spawn(process.execPath, [path.join(out, 'server.mjs'), '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  baseUrl = await new Promise((resolve, reject) => {
    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) resolve(`http://localhost:${match[1]}`);
    });
    server.on('exit', (code) => reject(new Error(`server exited with ${code}`)));
  });
});

after(() => server?.kill());

test('serves JSON for a route under any base path', async () => {
  const res = await fetch(`${baseUrl}/api/v3/pet/42`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);
  const pet = await res.json();
  assert.equal(typeof pet.name, 'string');
});

test('prefers static routes over params', async () => {
  const res = await fetch(`${baseUrl}/pet/findByStatus?status=available`);
  assert.ok(Array.isArray(await res.json()));
});

test('serves plain text, empty and binary responses', async () => {
  const login = await fetch(`${baseUrl}/user/login`);
  assert.match(login.headers.get('content-type'), /text\/plain/);
  assert.equal(typeof (await login.text()), 'string');

  const del = await fetch(`${baseUrl}/pet/1`, { method: 'DELETE' });
  assert.equal(del.status, 204);

  const report = await fetch(`${baseUrl}/user/anna/report`);
  assert.equal(report.headers.get('content-type'), 'application/octet-stream');
});

test('returns 404 for unknown routes and answers CORS preflight', async () => {
  const missing = await fetch(`${baseUrl}/nothing/here`);
  assert.equal(missing.status, 404);

  const preflight = await fetch(`${baseUrl}/pet`, {
    method: 'OPTIONS',
    headers: { Origin: 'http://localhost:4200', 'Access-Control-Request-Headers': 'content-type' },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:4200');
});

test('serves overrides without restarting', async () => {
  mkdirSync(path.join(out, 'overrides', 'StoreService'), { recursive: true });
  writeFileSync(path.join(out, 'overrides', 'StoreService', 'getInventory.json'), '{"available": 99}');
  const res = await fetch(`${baseUrl}/store/inventory`);
  assert.deepEqual(await res.json(), { available: 99 });
});
