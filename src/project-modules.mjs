import { createRequire } from 'node:module';
import path from 'node:path';
import { SourceError } from './files.mjs';

/**
 * Loads a package from the Angular project's node_modules, so this tool needs
 * no install of its own. Falls back to a copy next to the tool if there is one.
 */
function loadFromProject(projectDir, name) {
  const attempts = [
    createRequire(path.join(projectDir, 'package.json')),
    createRequire(import.meta.url),
  ];
  for (const require of attempts) {
    try {
      return require(name);
    } catch {
      // try the next location
    }
  }
  return null;
}

export function loadTypeScript(projectDir) {
  const ts = loadFromProject(projectDir, 'typescript');
  if (!ts) {
    throw new SourceError(
      `TypeScript was not found. Run "npm install" in ${projectDir} first, so node_modules/typescript exists.`,
    );
  }
  return ts;
}

/** Returns a function that parses YAML text, using js-yaml from the project. */
export function loadYamlParser(projectDir) {
  const yaml = loadFromProject(projectDir, 'js-yaml');
  const load = yaml?.load ?? yaml?.default?.load;
  if (!load) {
    throw new SourceError(
      `js-yaml was not found, it is needed to read .yaml specs. Run "npm install" in ${projectDir}, `
      + 'or add js-yaml to the project if it is missing. JSON specs work without it.',
    );
  }
  return (text) => load(text);
}
