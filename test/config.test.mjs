import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ConfigError, resolveConfig } from '../src/config.mjs';
import { copyFixture } from './helpers.mjs';

test('uses defaults relative to the project', () => {
  const project = copyFixture();
  const config = resolveConfig(['--project', project]);
  assert.equal(config.baseDir, path.join(project, 'src', 'app'));
  assert.equal(config.out, path.join(project, 'mock-server'));
  assert.equal(config.interceptorOut, path.join(project, 'src', 'app', 'mock-api'));
  assert.deepEqual(config.targets, ['server', 'interceptor']);
  assert.equal(config.generatorDir, null);
  assert.equal(config.port, 3000);
});

test('config file is applied and CLI flags win over it', () => {
  const project = copyFixture();
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({
    baseDir: 'src',
    port: 4000,
    targets: ['server'],
    prefix: 'api/',
  }));
  const config = resolveConfig(['--project', project, '--port', '5000']);
  assert.equal(config.baseDir, path.join(project, 'src'));
  assert.equal(config.port, 5000);
  assert.deepEqual(config.targets, ['server']);
  assert.equal(config.prefix, '/api');
});

test('rejects bad values', () => {
  const project = copyFixture();
  assert.throws(() => resolveConfig(['--project', project, '--targets', 'mobile']), ConfigError);
  assert.throws(() => resolveConfig(['--project', project, '--port', 'abc']), ConfigError);
  assert.throws(() => resolveConfig(['--project', project, '--unknown']), ConfigError);
  assert.throws(() => resolveConfig(['--project', path.join(project, 'missing')]), ConfigError);
});

test('explains Git Bash path conversion of --prefix', () => {
  const project = copyFixture();
  assert.throws(
    () => resolveConfig(['--project', project, '--prefix', 'C:/Program Files/Git/api']),
    /without the leading slash/,
  );
});
