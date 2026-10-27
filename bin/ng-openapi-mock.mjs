#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { ConfigError, HELP, resolveConfig } from '../src/config.mjs';
import { SourceError } from '../src/files.mjs';
import { generate } from '../src/generate.mjs';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 15)) {
  console.error(`ng-openapi-mock needs Node 22.15.0 or newer (found ${process.version}).`);
  process.exit(1);
}

try {
  const config = resolveConfig(process.argv.slice(2));
  if (config.help) {
    console.log(HELP);
  } else if (config.version) {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(pkg.version);
  } else {
    await generate(config);
  }
} catch (err) {
  if (err instanceof ConfigError || err instanceof SourceError) {
    console.error(`error: ${err.message}`);
    if (err instanceof ConfigError) console.error('Run with --help to see all options.');
  } else {
    console.error(err);
  }
  process.exit(1);
}
