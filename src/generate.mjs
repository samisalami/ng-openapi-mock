import path from 'node:path';
import { analyzeServices } from './analyze.mjs';
import { emitInterceptor, emitServer, ensureOverridesFolder, readOverrides } from './emit.mjs';
import { locateGeneratorDir, readGeneratorVersion, resolveSourceFiles, SourceError } from './files.mjs';
import { createMockFactory } from './mock-data.mjs';
import { loadTypeScript } from './typescript.mjs';

export async function generate(config, log = console.log) {
  const rel = (p) => path.relative(config.projectDir, p) || '.';
  const generatorDir = locateGeneratorDir(config);
  const version = readGeneratorVersion(generatorDir);
  log(`Reading ${rel(generatorDir)}${version ? ` (openapi-generator ${version})` : ''}`);

  const { files, missing } = resolveSourceFiles(generatorDir, config.baseDir);
  const warnings = missing.map((f) => `Listed in FILES but not found: ${f}`);
  if (files.length === 0) {
    throw new SourceError(`None of the .ts files in FILES were found. Check --base-dir (currently ${rel(config.baseDir)}).`);
  }

  const ts = loadTypeScript(config.projectDir);
  const { operations, warnings: analyzeWarnings, checker } = analyzeServices(ts, files);
  warnings.push(...analyzeWarnings);
  if (operations.length === 0) {
    throw new SourceError('No API calls found in the generated services.');
  }

  const mock = createMockFactory(ts, checker, config);
  const routes = sortRoutes(operations.map((op) => ({
    id: op.id,
    service: op.service,
    operation: op.operation,
    method: op.method,
    path: op.path,
    pattern: toPattern(op.path),
    status: op.kind === 'none' ? 204 : 200,
    kind: op.kind,
    body: op.kind === 'json' || op.kind === 'text' ? mock(op.type) : null,
  })));

  ensureOverridesFolder(config.out);
  const written = [];
  if (config.targets.includes('server')) {
    written.push(rel(emitServer(config, routes)));
  }
  if (config.targets.includes('interceptor')) {
    written.push(rel(emitInterceptor(config, routes, readOverrides(config.out, routes))));
  }

  for (const warning of warnings) log(`warning: ${warning}`);
  log(`Generated ${routes.length} mocked routes from ${files.length} files into ${written.join(' and ')}`);
  return { routes, warnings, files };
}

// Matches the route at the end of the request path, so it works no matter
// which base path (/api, /v1, a full URL, ...) the app uses.
export function toPattern(routePath) {
  const segments = routePath.split('/').filter(Boolean);
  if (segments.length === 0) return '^/?$';
  const parts = segments.map((s) => (s.startsWith(':') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return `(?:^|/)${parts.join('/')}/?$`;
}

// Longer paths first, and static segments before :params at the same length.
export function sortRoutes(routes) {
  const segments = (r) => r.path.split('/').filter(Boolean);
  const params = (r) => segments(r).filter((s) => s.startsWith(':')).length;
  return [...routes].sort((a, b) =>
    segments(b).length - segments(a).length
    || params(a) - params(b)
    || a.path.localeCompare(b.path)
    || a.method.localeCompare(b.method));
}
