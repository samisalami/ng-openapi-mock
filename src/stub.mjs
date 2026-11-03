import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALIAS = '@mock-api';
const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'mock-api.stub.ts');

/**
 * Creates the committed stub next to the output folder (once) and checks
 * that tsconfig maps '@mock-api' to the generated interceptor, falling back
 * to the stub. Returns the lines to show when the mapping is missing or off.
 */
export function setupStub(ts, config) {
  const stubFile = path.join(path.dirname(config.out), 'mock-api.stub.ts');
  const createdStub = !existsSync(stubFile);
  if (createdStub) {
    mkdirSync(path.dirname(stubFile), { recursive: true });
    writeFileSync(stubFile, readFileSync(TEMPLATE, 'utf8').replace(/\r\n/g, '\n'));
  }
  const interceptorFile = path.join(config.out, 'mock-api.interceptor.ts');
  return { stubFile, createdStub, hint: aliasHint(ts, config.projectDir, [interceptorFile, stubFile]) };
}

function aliasHint(ts, projectDir, targets) {
  const tsconfig = findTsconfig(ts, projectDir);
  if (!tsconfig) {
    return [`warning: No tsconfig.json found in ${projectDir}, so the ${ALIAS} alias can't be checked.`];
  }
  const { file, options } = tsconfig;
  const base = options.baseUrl ? path.resolve(path.dirname(file), options.baseUrl) : path.dirname(file);
  const toEntry = (target) => `./${path.relative(base, target).split(path.sep).join('/')}`;
  const expected = targets.map(toEntry);
  const name = path.basename(file);

  const current = options.paths?.[ALIAS];
  if (Array.isArray(current)) {
    const resolved = current.map((entry) => path.resolve(base, entry));
    if (resolved.length === 2 && resolved.every((p, i) => p === targets[i])) return [];
    return [
      `warning: "${ALIAS}" in ${name} should list the generated interceptor first and the stub second:`,
      `  "${ALIAS}": ${JSON.stringify(expected).replace(/","/g, '", "')}`,
    ];
  }
  const entry = `"${ALIAS}": ${JSON.stringify(expected).replace(/","/g, '", "')}`;
  return [
    '',
    `To commit the interceptor registration, add this to "compilerOptions" in ${name}:`,
    '',
    ...(options.paths ? [`  ${entry}   (to the existing "paths")`] : ['  "paths": {', `    ${entry}`, '  }']),
    '',
    `and import the interceptor in app.config.ts with: import { mockApiInterceptor } from '${ALIAS}';`,
  ];
}

// tsconfig.app.json replaces the "paths" of tsconfig.json when it has its own.
function findTsconfig(ts, projectDir) {
  const read = (name) => {
    const file = path.join(projectDir, name);
    if (!existsSync(file)) return null;
    const { config } = ts.readConfigFile(file, ts.sys.readFile);
    return config ? { file, options: config.compilerOptions ?? {} } : null;
  };
  const app = read('tsconfig.app.json');
  if (app?.options.paths) return app;
  return read('tsconfig.json') ?? app;
}
