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
  assert.equal(config.out, path.join(project, 'src', 'app', 'mock-api'));
  assert.equal(config.generatorDir, null);
  assert.equal(config.delay, 0);
});

test('config file is applied and CLI flags win over it', () => {
  const project = copyFixture();
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({
    baseDir: 'src',
    out: 'src/mocks',
    delay: 200,
  }));
  const config = resolveConfig(['--project', project, '--delay', '500']);
  assert.equal(config.baseDir, path.join(project, 'src'));
  assert.equal(config.out, path.join(project, 'src', 'mocks'));
  assert.equal(config.delay, 500);
});

test('mode defaults to pass-through and only accepts mock or pass-through', () => {
  const project = copyFixture();
  assert.equal(resolveConfig(['--project', project]).mode, 'pass-through');
  assert.equal(resolveConfig(['--project', project, '--mode', 'mock']).mode, 'mock');
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({ mode: 'mock' }));
  assert.equal(resolveConfig(['--project', project]).mode, 'mock');
  assert.throws(() => resolveConfig(['--project', project, '--mode', 'off']), /Use mock or pass-through/);
});

test('rejects unknown keys in the config file', () => {
  const project = copyFixture();
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({ Mode: 'pass-through', delay: 1 }));
  assert.throws(() => resolveConfig(['--project', project]), /Unknown key in .*: "Mode"\. Known keys: generatorDir, .*mode/);
});

test('logging is on by default and can be turned off', () => {
  const project = copyFixture();
  assert.equal(resolveConfig(['--project', project]).log, true);
  assert.equal(resolveConfig(['--project', project, '--no-log']).log, false);
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({ log: false }));
  assert.equal(resolveConfig(['--project', project]).log, false);
  assert.equal(resolveConfig(['--project', project, '--log']).log, true);
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({ log: 'yes' }));
  assert.throws(() => resolveConfig(['--project', project]), ConfigError);
});

test('rejects bad values', () => {
  const project = copyFixture();
  assert.throws(() => resolveConfig(['--project', project, '--delay', 'abc']), ConfigError);
  assert.throws(() => resolveConfig(['--project', project, '--targets', 'server']), ConfigError);
  assert.throws(() => resolveConfig(['--project', project, '--unknown']), ConfigError);
  assert.throws(() => resolveConfig(['--project', path.join(project, 'missing')]), ConfigError);
});
