import '@angular/compiler';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { before, test } from 'node:test';
import ts from 'typescript';
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

async function loadInterceptor() {
  for (const name of ['mock-api.data', 'mock-api.interceptor']) {
    const source = readFileSync(path.join(dir, `${name}.ts`), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    });
    writeFileSync(path.join(dir, `${name}.mjs`), outputText.replace("'./mock-api.data'", "'./mock-api.data.mjs'"));
  }
  return import(pathToFileURL(path.join(dir, 'mock-api.interceptor.mjs')).href);
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
