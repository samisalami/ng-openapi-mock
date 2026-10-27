import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { findGeneratorDirs, locateGeneratorDir, resolveSourceFiles, SourceError } from '../src/files.mjs';
import { copyFixture } from './helpers.mjs';

const GENERATOR = path.join('src', 'app', 'shared', 'backend', '.openapi-generator');

test('finds the nested .openapi-generator folder automatically', () => {
  const project = copyFixture();
  assert.deepEqual(findGeneratorDirs(project), [path.join(project, GENERATOR)]);
  assert.equal(locateGeneratorDir({ projectDir: project, generatorDir: null }), path.join(project, GENERATOR));
});

test('asks for --generator-dir when there are several', () => {
  const project = copyFixture();
  const second = path.join(project, 'libs', 'other', '.openapi-generator');
  mkdirSync(second, { recursive: true });
  writeFileSync(path.join(second, 'FILES'), '');
  assert.throws(() => locateGeneratorDir({ projectDir: project, generatorDir: null }), /--generator-dir/);
  assert.equal(locateGeneratorDir({ projectDir: project, generatorDir: second }), second);
});

test('ignores node_modules when searching', () => {
  const project = copyFixture();
  const hidden = path.join(project, 'node_modules', 'pkg', '.openapi-generator');
  mkdirSync(hidden, { recursive: true });
  writeFileSync(path.join(hidden, 'FILES'), '');
  assert.equal(findGeneratorDirs(project).length, 1);
});

test('resolves FILES entries against src/app and keeps only .ts files', () => {
  const project = copyFixture();
  const { files, missing } = resolveSourceFiles(path.join(project, GENERATOR), path.join(project, 'src', 'app'));
  assert.equal(missing.length, 0);
  assert.ok(files.every((f) => f.endsWith('.ts')));
  assert.ok(files.includes(path.join(project, 'src', 'app', 'shared', 'backend', 'api', 'pet.service.ts')));
  assert.ok(!files.some((f) => f.endsWith('README.md') || f.endsWith('git_push.sh')));
});

test('handles CRLF line endings, falls back to the generator folder and reports missing files', () => {
  const project = copyFixture();
  const out = path.join(project, 'libs', 'api');
  const generatorDir = path.join(out, '.openapi-generator');
  mkdirSync(path.join(out, 'api'), { recursive: true });
  mkdirSync(generatorDir, { recursive: true });
  writeFileSync(path.join(out, 'api', 'a.service.ts'), 'export class A {}');
  writeFileSync(path.join(generatorDir, 'FILES'), 'README.md\r\napi/a.service.ts\r\napi/gone.service.ts\r\n');
  const { files, missing } = resolveSourceFiles(generatorDir, path.join(project, 'src', 'app'));
  assert.deepEqual(files, [path.join(out, 'api', 'a.service.ts')]);
  assert.deepEqual(missing, ['api/gone.service.ts']);
});

test('fails clearly for a wrong --generator-dir', () => {
  const project = copyFixture();
  assert.throws(
    () => locateGeneratorDir({ projectDir: project, generatorDir: path.join(project, 'nope') }),
    SourceError,
  );
});
