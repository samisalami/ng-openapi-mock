import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

export const CONFIG_FILE_NAME = 'ng-openapi-mock.config.json';

export const DEFAULTS = Object.freeze({
  project: '.',
  generatorDir: null,
  baseDir: 'src/app',
  out: 'src/app/mock-api',
  delay: 0,
  log: true,
  arrayLength: 3,
  maxDepth: 4,
});

const OPTIONS = {
  project: { type: 'string', short: 'p' },
  'generator-dir': { type: 'string', short: 'g' },
  'base-dir': { type: 'string', short: 'b' },
  out: { type: 'string', short: 'o' },
  delay: { type: 'string' },
  log: { type: 'boolean' },
  'array-length': { type: 'string' },
  'max-depth': { type: 'string' },
  config: { type: 'string', short: 'c' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
};

export class ConfigError extends Error {}

/**
 * Merges defaults, the optional config file and CLI flags (in that order).
 * All paths in the result are absolute.
 */
export function resolveConfig(argv, cwd = process.cwd()) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: false, allowNegative: true, strict: true });
  } catch (err) {
    throw new ConfigError(err.message);
  }
  const flags = parsed.values;
  if (flags.help) return { help: true };
  if (flags.version) return { version: true };

  const projectDir = path.resolve(cwd, flags.project ?? DEFAULTS.project);
  if (!existsSync(projectDir)) throw new ConfigError(`Project folder not found: ${projectDir}`);

  const configPath = flags.config
    ? path.resolve(cwd, flags.config)
    : path.join(projectDir, CONFIG_FILE_NAME);
  let fileConfig = {};
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf8'));
    } catch (err) {
      throw new ConfigError(`Could not read ${configPath}: ${err.message}`);
    }
  } else if (flags.config) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

  const pick = (flag, key) => flags[flag] ?? fileConfig[key] ?? DEFAULTS[key];
  const fromProject = (p) => (p == null ? null : path.resolve(projectDir, p));

  return {
    projectDir,
    configPath: existsSync(configPath) ? configPath : null,
    generatorDir: fromProject(pick('generator-dir', 'generatorDir')),
    baseDir: fromProject(pick('base-dir', 'baseDir')),
    out: fromProject(pick('out', 'out')),
    delay: toInt(pick('delay', 'delay'), 'delay', 0),
    log: toBoolean(pick('log', 'log'), 'log'),
    arrayLength: toInt(pick('array-length', 'arrayLength'), 'array-length', 0),
    maxDepth: toInt(pick('max-depth', 'maxDepth'), 'max-depth', 1),
  };
}

function toInt(value, name, min) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new ConfigError(`--${name} must be a whole number >= ${min}.`);
  return n;
}

function toBoolean(value, name) {
  if (typeof value !== 'boolean') throw new ConfigError(`"${name}" must be true or false.`);
  return value;
}

export const HELP = `Usage: ng-openapi-mock [options]

Generates an Angular mock interceptor from the openapi-generator output
of an Angular project.

Options:
  -p, --project <dir>          Angular project root (default: current folder)
  -g, --generator-dir <dir>    The .openapi-generator folder, relative to the project
                               (default: searched automatically)
  -b, --base-dir <dir>         Folder the paths in FILES are relative to (default: src/app)
  -o, --out <dir>              Output folder (default: src/app/mock-api)
      --delay <ms>             Artificial response delay (default: 0)
      --no-log                 Don't log mocked calls to the browser console
      --array-length <n>       Items per generated array (default: 3)
      --max-depth <n>          How deep nested objects are filled (default: 4)
  -c, --config <file>          Config file (default: ${CONFIG_FILE_NAME} in the project)
  -h, --help                   Show this help
  -v, --version                Show the version
`;
