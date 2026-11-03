import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';
import ts from 'typescript';
import { build } from 'esbuild';
import { firstValueFrom, of } from 'rxjs';
import { HttpRequest, HttpResponse } from '@angular/common/http';
import { copyFixture, generateInto } from './helpers.mjs';

let dir;
let consoleCalls = [];
const originalConsole = {
  groupCollapsed: console.groupCollapsed, log: console.log, groupEnd: console.groupEnd, info: console.info,
};

before(async () => {
  for (const method of Object.keys(originalConsole)) {
    console[method] = (...args) => consoleCalls.push([method, ...args]);
  }
  const project = copyFixture();
  await generateInto(project);
  dir = path.join(project, 'src', 'app', 'mock-api');
  writeFileSync(path.join(dir, 'mock-api.overrides.ts'), `import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.data';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
  'GET /pet/{petId}': { id: 7, name: 'Rex', photoUrls: [] },
  'DELETE /pet/{petId}': { deleted: true },
  // A key from older overrides files.
  'StoreService.getOrderById': MOCK_API_GENERATED,
  'GET /user/login': MOCK_API_PASS_THROUGH,
};
`);
});

after(() => Object.assign(console, originalConsole));

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

test('a freshly created overrides file type-checks', async () => {
  const project = copyFixture();
  await generateInto(project);
  assert.deepEqual(typeErrors([path.join(project, 'src', 'app', 'mock-api', 'mock-api.interceptor.ts')]), []);
});

test('the routes file lists every call with its service method and response type', async () => {
  const project = copyFixture();
  const { routes } = await generateInto(project);
  const source = readFileSync(path.join(project, 'src', 'app', 'mock-api', 'mock-api.routes.ts'), 'utf8');
  for (const route of routes) assert.ok(source.includes(`readonly ${JSON.stringify(route.key)}?: unknown;`), route.key);
  assert.match(source, /\/\/ PetService\n {2}\/\*\* PetService\.addPet → 200 Pet \*\/\n {2}readonly "POST \/pet"\?: unknown;/);
  assert.match(source, /\/\*\* PetService\.deletePet → 204 no body \*\/\n {2}readonly "DELETE \/pet\/\{petId\}"/);
});

// What the editor shows next to a key while completing it in the overrides file.
test('override keys carry the documentation from the routes file', () => {
  const file = path.join(dir, 'mock-api.overrides.ts');
  const program = ts.createProgram({ rootNames: [file], options: { strict: true, noEmit: true } });
  const checker = program.getTypeChecker();
  const declaration = program.getSourceFile(file).statements
    .find((s) => ts.isVariableStatement(s)).declarationList.declarations[0];
  const type = checker.getTypeAtLocation(declaration.type);
  const doc = (key) => ts.displayPartsToString(checker.getPropertyOfType(type, key).getDocumentationComment(checker));
  assert.equal(doc('GET /pet/{petId}'), 'PetService.getPetById → 200 Pet');
  assert.equal(doc('POST /store/order'), 'StoreService.placeOrder → 200 Order');
});

test('the routes file is updated on every run, the overrides file is kept', async () => {
  const project = copyFixture();
  await generateInto(project);
  const out = path.join(project, 'src', 'app', 'mock-api');
  writeFileSync(path.join(out, 'mock-api.routes.ts'), '// outdated');
  writeFileSync(path.join(out, 'mock-api.overrides.ts'), '// mine');
  await generateInto(project);
  assert.match(readFileSync(path.join(out, 'mock-api.routes.ts'), 'utf8'), /"GET \/pet\/\{petId\}"/);
  assert.equal(readFileSync(path.join(out, 'mock-api.overrides.ts'), 'utf8'), '// mine');
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
async function loadInterceptor(query = '', from = dir) {
  for (const name of ['mock-api.routes', 'mock-api.data', 'mock-api.overrides', 'mock-api.interceptor']) {
    const source = readFileSync(path.join(from, `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    writeFileSync(path.join(from, `${name}.mjs`), outputText.replace(/'(\.\/mock-api\.[a-z]+)'/g, "'$1.mjs'"));
  }
  return import(pathToFileURL(path.join(from, 'mock-api.interceptor.mjs')).href + query);
}

test('pass-through mode only mocks the calls listed in the overrides file', async () => {
  const project = copyFixture();
  await generateInto(project, ['--mode', 'pass-through']);
  const modeDir = path.join(project, 'src', 'app', 'mock-api');
  writeFileSync(path.join(modeDir, 'mock-api.overrides.ts'), `import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.routes';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
  'GET /pet/{petId}': { id: 1, name: 'Listed', photoUrls: [] },
  'GET /store/inventory': MOCK_API_GENERATED,
  'GET /user/login': MOCK_API_PASS_THROUGH,
};
`);
  assert.deepEqual(typeErrors([path.join(modeDir, 'mock-api.interceptor.ts')]), []);

  const { mockApiInterceptor } = await loadInterceptor('', modeDir);
  const real = new HttpResponse({ status: 200, body: 'real backend' });
  const call = (method, url) => firstValueFrom(mockApiInterceptor(new HttpRequest(method, url), () => of(real)));
  consoleCalls = [];

  assert.deepEqual((await call('GET', '/api/pet/1')).body, { id: 1, name: 'Listed', photoUrls: [] });
  assert.deepEqual(Object.keys((await call('GET', '/api/store/inventory')).body), ['key1', 'key2'],
    'MOCK_API_GENERATED mocks with the generated data');
  assert.equal(await call('GET', '/api/store/order/1'), real, 'unlisted calls go to the real API');
  assert.equal(await call('GET', '/api/user/login'), real);

  const [, info] = consoleCalls.find(([method]) => method === 'info');
  assert.match(info, /pass-through mode/);
  assert.equal(consoleCalls.filter(([method]) => method === 'info').length, 1, 'the mode is announced once');
  const lines = consoleCalls.filter(([m]) => m === 'groupCollapsed' || m === 'log').map(([, text]) => text).join('\n');
  assert.ok(!lines.includes('/store/order/1'), 'unlisted pass-throughs are not logged');
});

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

test('sends pass-through calls to the real API and logs them', async () => {
  const { mockApiInterceptor } = await loadInterceptor();
  const real = new HttpResponse({ status: 200, body: 'real token' });
  consoleCalls = [];

  const login = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/api/user/login'), () => of(real)));
  assert.equal(login, real);
  const [, line] = consoleCalls.find(([method]) => method === 'log');
  assert.match(line, /GET \/api\/user\/login → real API %c'GET \/user\/login' \(pass-through\)/);

  const logout = await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/api/user/logout'), () => of(real)));
  assert.equal(logout.status, 204, 'other calls are still mocked');
});

test('logs each mocked call to the browser console', async () => {
  const { mockApiInterceptor } = await loadInterceptor();
  const next = () => of(new HttpResponse({ status: 200 }));
  consoleCalls = [];

  await firstValueFrom(mockApiInterceptor(new HttpRequest('POST', '/api/store/order', { petId: 1 }), next));
  await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/api/pet/7?details=true'), next));
  await firstValueFrom(mockApiInterceptor(new HttpRequest('GET', '/assets/i18n/de.json'), next));

  const groups = consoleCalls.filter(([method]) => method === 'groupCollapsed').map(([, title]) => title);
  assert.equal(groups.length, 2, 'only mocked calls are logged');
  assert.match(groups[0], /\[mock\]%c POST \/api\/store\/order → 200 %c'POST \/store\/order' \(generated, \d+ ms\)/);
  assert.match(groups[1], /GET \/api\/pet\/7\?details=true → 200 %c'GET \/pet\/\{petId\}' \(override/);
  assert.deepEqual(consoleCalls.find(([, label]) => label === 'request body')[2], { petId: 1 });
  assert.equal(consoleCalls.filter(([method]) => method === 'groupEnd').length, 2);
});

test('--no-log turns console logging off', async () => {
  const project = copyFixture();
  await generateInto(project, ['--no-log']);
  const data = readFileSync(path.join(project, 'src', 'app', 'mock-api', 'mock-api.data.ts'), 'utf8');
  assert.match(data, /MOCK_API_LOG = false;/);
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
  assert.ok(!production.includes('[mock]'), 'console logging is tree-shaken');
  assert.ok(!production.includes('pass-through'), 'pass-through marker is tree-shaken');

  const development = await bundle({});
  assert.ok(development.includes('PetService.getPetById'), 'development build keeps the mocks');
  assert.ok(development.includes('Rex'), 'development build keeps the overrides');
});
