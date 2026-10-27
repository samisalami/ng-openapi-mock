import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Uses the TypeScript compiler of the Angular project, so this tool needs no
 * install of its own. Falls back to a copy next to the tool if there is one.
 */
export function loadTypeScript(projectDir) {
  const attempts = [
    createRequire(path.join(projectDir, 'package.json')),
    createRequire(import.meta.url),
  ];
  for (const require of attempts) {
    try {
      return require('typescript');
    } catch {
      // try the next location
    }
  }
  throw new Error(
    `TypeScript was not found. Run "npm install" in ${projectDir} first, so node_modules/typescript exists.`,
  );
}
