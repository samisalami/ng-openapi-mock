import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { resolveConfig } from '../src/config.mjs';
import { generate } from '../src/generate.mjs';
import { copyFixture } from './helpers.mjs';

const ENTRY = '"@mock-api": ["./src/app/mock-api/mock-api.interceptor.ts", "./src/app/mock-api.stub.ts"]';

async function run(project, args = ['--stub']) {
  const lines = [];
  await generate(resolveConfig(['--project', project, ...args]), (line) => lines.push(line));
  return lines.join('\n');
}

test('--stub creates the stub next to the output folder once', async () => {
  const project = copyFixture();
  const stub = path.join(project, 'src', 'app', 'mock-api.stub.ts');
  await run(project, []);
  assert.ok(!existsSync(stub), 'no stub without --stub');

  const output = await run(project);
  assert.match(output, /Created src[\\/]app[\\/]mock-api\.stub\.ts, commit it/);
  writeFileSync(stub, '// mine');
  assert.doesNotMatch(await run(project), /Created .*stub/);
  assert.equal(readFileSync(stub, 'utf8'), '// mine');
});

test('"stub" can be set in the config file', () => {
  const project = copyFixture();
  assert.equal(resolveConfig(['--project', project]).stub, false);
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({ stub: true }));
  assert.equal(resolveConfig(['--project', project]).stub, true);
});

test('shows the tsconfig entry until the alias is set up', async () => {
  const project = copyFixture();
  const tsconfig = path.join(project, 'tsconfig.json');

  writeFileSync(tsconfig, '{\n  // comments are fine\n  "compilerOptions": { "strict": true }\n}\n');
  let output = await run(project);
  assert.ok(output.includes(`"paths": {\n    ${ENTRY}\n  }`), output);
  assert.match(output, /import \{ mockApiInterceptor \} from '@mock-api'/);

  writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { paths: { '@env': ['./src/env.ts'] } } }));
  assert.ok((await run(project)).includes(`${ENTRY}   (to the existing "paths")`));

  writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { paths: { '@mock-api': ['./src/app/mock-api.stub.ts'] } } }));
  assert.match(await run(project), /warning: "@mock-api" in tsconfig\.json should list the generated interceptor first/);

  writeFileSync(tsconfig, JSON.stringify({ compilerOptions: { paths: {
    '@mock-api': ['./src/app/mock-api/mock-api.interceptor.ts', './src/app/mock-api.stub.ts'],
  } } }));
  assert.doesNotMatch(await run(project), /@mock-api/);
});

test('uses baseUrl and the paths of tsconfig.app.json', async () => {
  const project = copyFixture();
  writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({ compilerOptions: { paths: {
    '@mock-api': ['./src/app/mock-api/mock-api.interceptor.ts', './src/app/mock-api.stub.ts'],
  } } }));
  writeFileSync(path.join(project, 'tsconfig.app.json'), JSON.stringify({
    extends: './tsconfig.json', compilerOptions: { baseUrl: 'src', paths: { '@env': ['./env.ts'] } },
  }));
  const output = await run(project);
  assert.ok(output.includes('"@mock-api": ["./app/mock-api/mock-api.interceptor.ts", "./app/mock-api.stub.ts"]'), output);
  assert.match(output, /compilerOptions" in tsconfig\.app\.json/);
});

// The app imports from '@mock-api' and must compile with and without the generated files.
test('the alias resolves to the interceptor, or to the stub when the mocks are missing', async () => {
  const project = copyFixture();
  await run(project);
  const main = path.join(project, 'src', 'main.ts');
  writeFileSync(main, `import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { mockApiInterceptor } from '@mock-api';
export const providers = [provideHttpClient(withInterceptors([mockApiInterceptor]))];
`);
  const resolved = () => {
    const program = ts.createProgram({
      rootNames: [main],
      options: {
        strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.Preserve, moduleResolution: ts.ModuleResolutionKind.Bundler,
        paths: { '@mock-api': ['./src/app/mock-api/mock-api.interceptor.ts', './src/app/mock-api.stub.ts'] },
        pathsBasePath: project,
      },
    });
    const errors = ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    assert.deepEqual(errors, []);
    return program.getSourceFiles().map((f) => path.basename(f.fileName)).filter((f) => f.startsWith('mock-api.'));
  };

  assert.ok(resolved().includes('mock-api.interceptor.ts'));
  rmSync(path.join(project, 'src', 'app', 'mock-api'), { recursive: true });
  assert.deepEqual(resolved(), ['mock-api.stub.ts']);
});
