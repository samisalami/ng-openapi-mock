import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

export const CONFIG_FILE_NAME = 'ng-openapi-mock.config.json';

export const DEFAULTS = Object.freeze({
  project: '.',
  generatorDir: null,
  baseDir: 'src/app',
  targets: ['server', 'interceptor'],
  out: 'mock-server',
  interceptorOut: 'src/app/mock-api',
  port: 3000,
  prefix: null,
  delay: 0,
  arrayLength: 3,
  maxDepth: 4,
});

const TARGETS = new Set(['server', 'interceptor']);

const OPTIONS = {
  project: { type: 'string', short: 'p' },
  'generator-dir': { type: 'string', short: 'g' },
  'base-dir': { type: 'string', short: 'b' },
  targets: { type: 'string', short: 't' },
  out: { type: 'string', short: 'o' },
  'interceptor-out': { type: 'string' },
  port: { type: 'string' },
  prefix: { type: 'string' },
  delay: { type: 'string' },
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
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: false, strict: true });
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

  const targets = parseTargets(pick('targets', 'targets'));
  const prefix = pick('prefix', 'prefix');
  if (prefix && /^[a-z]:[\\/]/i.test(prefix)) {
    // Git Bash rewrites "/api" into "C:/Program Files/Git/api" before Node sees it.
    throw new ConfigError(`--prefix "${prefix}" looks like a Windows path. In Git Bash write --prefix api (without the leading slash).`);
  }

  return {
    projectDir,
    configPath: existsSync(configPath) ? configPath : null,
    generatorDir: fromProject(pick('generator-dir', 'generatorDir')),
    baseDir: fromProject(pick('base-dir', 'baseDir')),
    targets,
    out: fromProject(pick('out', 'out')),
    interceptorOut: fromProject(pick('interceptor-out', 'interceptorOut')),
    port: toInt(pick('port', 'port'), 'port', 1),
    prefix: prefix ? '/' + String(prefix).replace(/^\/+|\/+$/g, '') : null,
    delay: toInt(pick('delay', 'delay'), 'delay', 0),
    arrayLength: toInt(pick('array-length', 'arrayLength'), 'array-length', 0),
    maxDepth: toInt(pick('max-depth', 'maxDepth'), 'max-depth', 1),
  };
}

function parseTargets(value) {
  const list = Array.isArray(value) ? value : String(value).split(',');
  const targets = list.map((t) => String(t).trim()).filter(Boolean);
  for (const t of targets) {
    if (!TARGETS.has(t)) throw new ConfigError(`Unknown target "${t}". Use server, interceptor or both.`);
  }
  if (targets.length === 0) throw new ConfigError('At least one target is required.');
  return [...new Set(targets)];
}

function toInt(value, name, min) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new ConfigError(`--${name} must be a whole number >= ${min}.`);
  return n;
}

export const HELP = `Usage: ng-openapi-mock [options]

Generates a mock server and/or an Angular mock interceptor from the
openapi-generator output of an Angular project.

Options:
  -p, --project <dir>          Angular project root (default: current folder)
  -g, --generator-dir <dir>    The .openapi-generator folder, relative to the project
                               (default: searched automatically)
  -b, --base-dir <dir>         Folder the paths in FILES are relative to (default: src/app)
  -t, --targets <list>         server, interceptor or server,interceptor (default: both)
  -o, --out <dir>              Mock server output folder (default: mock-server)
      --interceptor-out <dir>  Interceptor output folder (default: src/app/mock-api)
      --port <n>               Default mock server port (default: 3000)
      --prefix <path>          API path prefix, writes a proxy.conf.json (e.g. /api)
      --delay <ms>             Artificial response delay (default: 0)
      --array-length <n>       Items per generated array (default: 3)
      --max-depth <n>          How deep nested objects are filled (default: 4)
  -c, --config <file>          Config file (default: ${CONFIG_FILE_NAME} in the project)
  -h, --help                   Show this help
  -v, --version                Show the version
`;
