import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const GENERATOR_DIR_NAME = '.openapi-generator';
const SKIP_DIRS = new Set(['node_modules', '.git', '.angular', 'dist', 'coverage', '.nx', '.cache']);

export class SourceError extends Error {}

/** Finds every .openapi-generator folder that contains a FILES list. */
export function findGeneratorDirs(projectDir) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === GENERATOR_DIR_NAME) {
        if (existsSync(path.join(full, 'FILES'))) found.push(full);
      } else {
        walk(full);
      }
    }
  };
  walk(projectDir);
  return found;
}

export function locateGeneratorDir(config) {
  if (config.generatorDir) {
    if (!existsSync(path.join(config.generatorDir, 'FILES'))) {
      throw new SourceError(`No FILES list found in ${config.generatorDir}`);
    }
    return config.generatorDir;
  }
  const found = findGeneratorDirs(config.projectDir);
  if (found.length === 1) return found[0];
  if (found.length === 0) {
    throw new SourceError(`No ${GENERATOR_DIR_NAME} folder with a FILES list found in ${config.projectDir}`);
  }
  const list = found.map((d) => '  ' + path.relative(config.projectDir, d)).join('\n');
  throw new SourceError(`Found several ${GENERATOR_DIR_NAME} folders, pick one with --generator-dir:\n${list}`);
}

/** Reads FILES: one path per line, no wildcards. */
export function readFilesList(generatorDir) {
  return readFileSync(path.join(generatorDir, 'FILES'), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function readGeneratorVersion(generatorDir) {
  const file = path.join(generatorDir, 'VERSION');
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : null;
}

/**
 * Resolves the TypeScript files listed in FILES. Each entry is looked up
 * relative to the base dir first, then relative to the folder that holds
 * .openapi-generator (openapi-generator's own convention).
 */
export function resolveSourceFiles(generatorDir, baseDir) {
  const generatorRoot = path.dirname(generatorDir);
  const files = [];
  const missing = [];
  for (const entry of readFilesList(generatorDir)) {
    if (!entry.endsWith('.ts') || entry.endsWith('.d.ts')) continue;
    const candidates = [baseDir, generatorRoot].filter(Boolean).map((root) => path.resolve(root, entry));
    const hit = candidates.find((file) => existsSync(file) && statSync(file).isFile());
    if (hit) files.push(hit);
    else missing.push(entry);
  }
  return { files: [...new Set(files)], missing };
}
