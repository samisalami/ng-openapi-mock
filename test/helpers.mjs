import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from '../src/config.mjs';
import { generate } from '../src/generate.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'sample-app');

/** Copies the fixture app into .tmp/ (inside the repo, so node_modules resolve). */
export function copyFixture() {
  const tmpRoot = path.join(ROOT, '.tmp');
  mkdirSync(tmpRoot, { recursive: true });
  const dir = mkdtempSync(path.join(tmpRoot, 'app-'));
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

export async function generateInto(projectDir, args = []) {
  const config = resolveConfig(['--project', projectDir, ...args]);
  const result = await generate(config, () => {});
  return { config, ...result };
}
