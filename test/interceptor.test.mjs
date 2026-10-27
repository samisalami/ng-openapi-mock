import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, test } from 'node:test';
import ts from 'typescript';
import { build } from 'esbuild';
import { firstValueFrom, of } from 'rxjs';
import { HttpRequest, HttpResponse } from '@angular/common/http';
import { copyFixture, generateInto } from './helpers.mjs';

let dir;

before(async () => {
  const project = copyFixture();
  await generateInto(project, ['--targets', 'interceptor']);
  dir = path.join(project, 'src', 'app', 'mock-api');
});

test('generated interceptor type-checks against Angular 21.2 in strict mode', () => {
  const program = ts.createProgram({
    rootNames: [path.join(dir, 'mock-api.interceptor.ts')],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noEmit: true,
      skipLibCheck: true,
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program)
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  assert.deepEqual(diagnostics, []);
});

// The query string forces a fresh module, since the dev-mode check runs at load time.
async function loadInterceptor(query = '') {
  for (const name of ['mock-api.data', 'mock-api.interceptor']) {
    const source = readFileSync(path.join(dir, `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    writeFileSync(path.join(dir, `${name}.mjs`), outputText.replace("'./mock-api.data'", "'./mock-api.data.mjs'"));
  }
  return import(pathToFileURL(path.join(dir, 'mock-api.interceptor.mjs')).href + query);
}

test('answers mocked routes and passes the rest through', async () => {
  const { mockApiInterceptor } = await loadInterceptor();
  const passthrough = new HttpResponse({ status: 200, body: 'real backend' });
  const next = () => of(passthrough);

  const pet = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', 'https://api.example.com/v3/pet/7'), next));
  assert.equal(pet.status, 200);
  assert.equal(typeof pet.body.name, 'string');

  const deleted = await firstValueFrom(mockApiInterceptor(new HttpRequest('DELETE', '/api/pet/7'), next));
  assert.equal(deleted.status, 204);
  assert.equal(deleted.body, null);

  const other = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/assets/i18n/de.json'), next));
  assert.equal(other, passthrough);
});

test('passes everything through in production mode', async () => {
  const passthrough = new HttpResponse({ status: 200, body: 'real backend' });
  const previous = globalThis.ngDevMode;
  globalThis.ngDevMode = false;
  try {
    const { mockApiInterceptor } = await loadInterceptor('?production');
    const result = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/api/pet/7'), () => of(passthrough)));
    assert.equal(result, passthrough);
  } finally {
    globalThis.ngDevMode = previous;
  }
});

// Mirrors what the Angular 21 application builder does for production builds:
// esbuild with ngDevMode defined as false and minification on.
test('production builds leave the mock data out of the bundle', async () => {
  const bundle = (define) => build({
    entryPoints: [path.join(dir, 'mock-api.interceptor.ts')],
    bundle: true,
    write: false,
    minify: true,
    format: 'esm',
    external: ['@angular/*', 'rxjs'],
    define,
    logLevel: 'silent',
  }).then((r) => r.outputFiles[0].text);

  const production = await bundle({ ngDevMode: 'false' });
  assert.ok(!production.includes('PetService.getPetById'), 'mock routes are tree-shaken');
  assert.ok(!production.includes('example.com'), 'mock bodies are tree-shaken');

  const development = await bundle({});
  assert.ok(development.includes('PetService.getPetById'), 'development build keeps the mocks');
});
