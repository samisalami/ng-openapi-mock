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
  await generateInto(project);
  dir = path.join(project, 'src', 'app', 'mock-api');
  writeFileSync(path.join(dir, 'mock-api.overrides.ts'), `import { MockApiOverrides } from './mock-api.data';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
  'PetService.getPetById': { id: 7, name: 'Rex', photoUrls: [] },
  'PetService.deletePet': { deleted: true },
};
`);
});

// Compiler options of a new Angular 21 project.
function typeErrors(rootNames) {
  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      strict: true,
      isolatedModules: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noEmit: true,
      skipLibCheck: true,
    },
  });
  return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

test('generated files type-check against Angular 21.2 in strict mode', () => {
  assert.deepEqual(typeErrors([path.join(dir, 'mock-api.interceptor.ts')]), []);
});

test('the overrides file rejects unknown keys', () => {
  const file = path.join(dir, 'typo.ts');
  writeFileSync(file, `import { MockApiOverrides } from './mock-api.data';
export const x: MockApiOverrides = { 'PetService.getPetByld': {} };
`);
  const errors = typeErrors([file]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /PetService\.getPetByld/);
});

// The query string forces a fresh module, since the dev-mode check runs at load time.
async function loadInterceptor(query = '') {
  for (const name of ['mock-api.data', 'mock-api.overrides', 'mock-api.interceptor']) {
    const source = readFileSync(path.join(dir, `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    writeFileSync(path.join(dir, `${name}.mjs`), outputText.replace(/'(\.\/mock-api\.[a-z]+)'/g, "'$1.mjs'"));
  }
  return import(pathToFileURL(path.join(dir, 'mock-api.interceptor.mjs')).href + query);
}

test('answers mocked routes and passes the rest through', async () => {
  const { mockApiInterceptor } = await loadInterceptor();
  const passthrough = new HttpResponse({ status: 200, body: 'real backend' });
  const next = () => of(passthrough);

  const order = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', 'https://api.example.com/v3/store/order/7'), next));
  assert.equal(order.status, 200);
  assert.equal(typeof order.body.totalPrice, 'number');

  const deleted = await firstValueFrom(mockApiInterceptor(new HttpRequest('DELETE', '/api/store/order/7'), next));
  assert.equal(deleted.status, 204);
  assert.equal(deleted.body, null);

  const other = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/assets/i18n/de.json'), next));
  assert.equal(other, passthrough);
});

test('uses overrides instead of the generated data', async () => {
  const { mockApiInterceptor } = await loadInterceptor();
  const next = () => of(new HttpResponse({ status: 200 }));

  const pet = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/api/pet/7'), next));
  assert.deepEqual(pet.body, { id: 7, name: 'Rex', photoUrls: [] });

  const deleted = await firstValueFrom(mockApiInterceptor(new HttpRequest('DELETE', '/api/pet/7'), next));
  assert.equal(deleted.status, 200, 'an override gives a 204 endpoint a body');
  assert.deepEqual(deleted.body, { deleted: true });
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
test('production builds leave the mock data and overrides out of the bundle', async () => {
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
  assert.ok(!production.includes('Rex'), 'overrides are tree-shaken');

  const development = await bundle({});
  assert.ok(development.includes('PetService.getPetById'), 'development build keeps the mocks');
  assert.ok(development.includes('Rex'), 'development build keeps the overrides');
});
