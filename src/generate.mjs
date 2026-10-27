import path from 'node:path';
import { analyzeServices } from './analyze.mjs';
import { emitInterceptor } from './emit.mjs';
import { locateGeneratorDir, readGeneratorVersion, resolveSourceFiles, SourceError } from './files.mjs';
import { createMockFactory } from './mock-data.mjs';
import { loadTypeScript } from './project-modules.mjs';
import { loadSpecs } from './spec.mjs';

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

  const specs = config.specs.length > 0 ? loadSpecs(config.specs, config.projectDir) : null;
  const mock = createMockFactory(ts, checker, config, specs);
  const unmatched = [];
  const routes = sortRoutes(operations.map((op) => {
    const specOp = specs?.findOperation(op.method, op.path, op.operation) ?? null;
    if (specs && !specOp) unmatched.push(op.id);
    const hasBody = op.kind === 'json' || op.kind === 'text';
    let body = null;
    if (hasBody) {
      body = specOp?.example.found ? structuredClone(specOp.example.value) : mock(op.type, specOp?.schema);
    }
    return {
      id: op.id,
      service: op.service,
      operation: op.operation,
      method: op.method,
      path: op.path,
      pattern: toPattern(op.path),
      status: specOp?.status ?? (op.kind === 'none' ? 204 : 200),
      kind: op.kind,
      body,
    };
  }));

  const { out, createdOverrides } = emitInterceptor(config, routes);

  if (specs) {
    warnings.push(...specs.warnings);
    for (const spec of specs.specs.filter((s) => s.matched === 0)) {
      warnings.push(`${rel(spec.file)} matched none of the app's API calls.`);
    }
    if (unmatched.length > 0) {
      const shown = unmatched.slice(0, 10).join(', ') + (unmatched.length > 10 ? ', ...' : '');
      warnings.push(`${unmatched.length} calls are not in any spec and use generated data only: ${shown}`);
    }
  }
  for (const warning of warnings) log(`warning: ${warning}`);
  if (specs) {
    const names = specs.specs.map((s) => `${path.basename(s.file)} (${s.version})`).join(', ');
    log(`Matched ${routes.length - unmatched.length} of ${routes.length} calls to ${names}`);
  }
  log(`Generated ${routes.length} mocked routes from ${files.length} files into ${rel(out)}`);
  if (createdOverrides) log(`Created ${rel(path.join(out, 'mock-api.overrides.ts'))} for your custom responses`);
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
