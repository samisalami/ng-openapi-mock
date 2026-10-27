import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { SourceError } from './files.mjs';
import { loadYamlParser } from './project-modules.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch'];
const SPEC_FILE = /\.(ya?ml|json)$/i;

/**
 * Loads OpenAPI 3.0/3.1 and Swagger 2.0 documents. They only add detail to
 * the mocks (examples, formats, limits, status codes); which calls exist is
 * still decided by the generated Angular client.
 *
 * Schemas are passed around as nodes, { doc, value }, so that $refs resolve
 * relative to the file they are written in.
 */
export function loadSpecs(specPaths, projectDir) {
  const documents = new Map();
  let parseYaml = null;
  const warnings = [];

  const load = (file) => {
    const absolute = path.resolve(file);
    if (!documents.has(absolute)) {
      if (!existsSync(absolute)) throw new SourceError(`Spec file not found: ${absolute}`);
      const text = readFileSync(absolute, 'utf8');
      let root;
      try {
        if (/\.json$/i.test(absolute)) {
          root = JSON.parse(text);
        } else {
          parseYaml ??= loadYamlParser(projectDir);
          root = parseYaml(text);
        }
      } catch (err) {
        if (err instanceof SourceError) throw err;
        throw new SourceError(`Could not read ${absolute}: ${err.message}`);
      }
      documents.set(absolute, { file: absolute, root });
    }
    return documents.get(absolute);
  };

  const resolve = (node) => {
    let current = node;
    for (let hops = 0; current?.value && typeof current.value.$ref === 'string'; hops++) {
      if (hops > 50) throw new SourceError(`$ref loop in ${current.doc.file}`);
      const [filePart, pointer = ''] = current.value.$ref.split('#');
      const doc = filePart ? load(path.resolve(path.dirname(current.doc.file), filePart)) : current.doc;
      const value = followPointer(doc.root, pointer);
      if (value === undefined) {
        warnings.push(`Unresolved $ref "${current.value.$ref}" in ${current.doc.file}`);
        return null;
      }
      current = { doc, value };
    }
    return current?.value == null ? null : current;
  };

  const child = (node, value) => (value === undefined ? null : { doc: node.doc, value });

  // A schema's own keywords, plus those of a single allOf member (the
  // common "allOf: [$ref], description: ..." wrapper).
  const info = (node, depth = 0) => {
    const resolved = resolve(node);
    if (!resolved) return {};
    const { allOf, ...own } = resolved.value;
    if (!Array.isArray(allOf) || depth > 10) return own;
    const inherited = Object.assign({}, ...allOf.map((m) => info(child(resolved, m), depth + 1)));
    delete inherited.example;
    delete inherited.examples;
    if (allOf.length === 1) {
      const single = example(child(resolved, allOf[0]));
      if (single.found && !hasExample(own)) own.example = single.value;
    }
    return { ...inherited, ...own };
  };

  const example = (node) => {
    const resolved = resolve(node);
    if (!resolved) return { found: false };
    const own = resolved.value;
    if (hasExample(own)) return { found: true, value: exampleValue(own) };
    if (Array.isArray(own.allOf) && own.allOf.length === 1) return example(child(resolved, own.allOf[0]));
    return { found: false };
  };

  const property = (node, name, depth = 0) => {
    const resolved = resolve(node);
    if (!resolved || depth > 10) return null;
    const { properties, allOf } = resolved.value;
    if (properties && Object.hasOwn(properties, name)) return child(resolved, properties[name]);
    for (const member of Array.isArray(allOf) ? allOf : []) {
      const found = property(child(resolved, member), name, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const items = (node) => {
    const resolved = resolve(node);
    if (!resolved) return null;
    if (resolved.value.items) return child(resolved, resolved.value.items);
    const { allOf } = resolved.value;
    return Array.isArray(allOf) && allOf.length === 1 ? items(child(resolved, allOf[0])) : null;
  };

  const additional = (node) => {
    const resolved = resolve(node);
    const extra = resolved?.value.additionalProperties;
    return extra && typeof extra === 'object' ? child(resolved, extra) : null;
  };

  const variant = (node, index) => {
    const resolved = resolve(node);
    const list = resolved?.value.oneOf ?? resolved?.value.anyOf;
    return Array.isArray(list) && list[index] ? child(resolved, list[index]) : null;
  };

  // Index every operation of every spec by method and path.
  const operations = [];
  const specs = [];
  for (const { file, explicit } of expandSpecPaths(specPaths)) {
    const doc = load(file);
    const version = doc.root?.openapi ?? doc.root?.swagger;
    if (!version) {
      // Folders often hold shared component files that are only $ref targets.
      if (explicit) warnings.push(`${file} has no "openapi" or "swagger" field, skipped.`);
      continue;
    }
    if (!/^(2\.0|3\.[01])(\.|$)/.test(String(version))) {
      warnings.push(`${path.basename(file)} uses version ${version}; only 2.0, 3.0 and 3.1 are supported, trying anyway.`);
    }
    const spec = { file, version: String(version), matched: 0 };
    specs.push(spec);
    for (const [specPath, pathItem] of Object.entries(doc.root.paths ?? {})) {
      for (const method of METHODS) {
        const op = pathItem?.[method];
        if (!op) continue;
        operations.push({
          spec,
          method: method.toUpperCase(),
          key: pathKey(specPath),
          operationId: op.operationId,
          ...successResponse({ doc, value: op }, resolve, child),
        });
      }
    }
  }
  if (specs.length === 0) throw new SourceError('None of the given spec files is an OpenAPI document.');

  /** Finds the spec operation for a generated call: by method and path, then by operationId. */
  const findOperation = (method, routePath, operationName) => {
    const key = pathKey(routePath);
    const simplify = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = operations.find((op) => op.method === method && op.key === key)
      ?? operations.find((op) => op.method === method && simplify(op.operationId) === simplify(operationName));
    if (found) found.spec.matched++;
    return found ?? null;
  };

  return { specs, warnings, findOperation, info, example, property, items, additional, variant };
}

/** Expands folders into the spec files directly inside them. */
export function expandSpecPaths(specPaths) {
  const files = [];
  for (const specPath of specPaths) {
    if (!existsSync(specPath)) throw new SourceError(`Spec not found: ${specPath}`);
    if (statSync(specPath).isDirectory()) {
      const inFolder = readdirSync(specPath).filter((name) => SPEC_FILE.test(name)).sort();
      if (inFolder.length === 0) throw new SourceError(`No .yaml, .yml or .json files in ${specPath}`);
      files.push(...inFolder.map((name) => ({ file: path.join(specPath, name), explicit: false })));
    } else {
      files.push({ file: specPath, explicit: true });
    }
  }
  const seen = new Set();
  return files.filter(({ file }) => !seen.has(path.resolve(file)) && seen.add(path.resolve(file)));
}

/** /pet/{petId} and /pet/:petId both become /pet/{} */
export function pathKey(routePath) {
  const key = routePath.replace(/\{[^}]+\}|:[^/]+/g, '{}').replace(/\/+$/, '');
  return key || '/';
}

function successResponse(opNode, resolve, child) {
  const responses = opNode.value.responses ?? {};
  const codes = Object.keys(responses);
  const code = codes.filter((c) => /^2\d\d$/.test(c)).sort()[0]
    ?? codes.find((c) => /^2xx$/i.test(c))
    ?? (codes.includes('default') ? 'default' : null);
  if (!code) return { status: null, schema: null, example: { found: false } };

  const response = resolve(child(opNode, responses[code]));
  const status = /^2\d\d$/.test(code) ? Number(code) : null;
  if (!response) return { status, schema: null, example: { found: false } };
  const value = response.value;

  // Swagger 2.0: schema and examples sit directly on the response.
  if (value.schema && !value.content) {
    const examples = value.examples ?? {};
    const key = Object.keys(examples).find((k) => /json/i.test(k)) ?? Object.keys(examples)[0];
    return {
      status,
      schema: child(response, value.schema),
      example: key ? { found: true, value: examples[key] } : { found: false },
    };
  }

  const content = value.content ?? {};
  const mediaType = Object.keys(content).find((k) => /json/i.test(k)) ?? Object.keys(content)[0];
  const media = mediaType ? content[mediaType] : null;
  if (!media) return { status, schema: null, example: { found: false } };

  let example = { found: false };
  if (media.example !== undefined) {
    example = { found: true, value: media.example };
  } else if (media.examples && typeof media.examples === 'object') {
    const first = Object.values(media.examples)[0];
    const resolved = first && resolve(child(response, first));
    if (resolved && resolved.value.value !== undefined) example = { found: true, value: resolved.value.value };
  }
  return { status, schema: media.schema ? child(response, media.schema) : null, example };
}

function hasExample(schema) {
  return schema.example !== undefined
    || (Array.isArray(schema.examples) && schema.examples.length > 0)
    || schema['x-example'] !== undefined
    || schema.const !== undefined
    || isScalar(schema.default);
}

// Object and array defaults are usually {} or [], which make worse mocks than generated data.
function isScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function exampleValue(schema) {
  if (schema.example !== undefined) return schema.example;
  if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
  if (schema['x-example'] !== undefined) return schema['x-example'];
  if (schema.const !== undefined) return schema.const;
  return schema.default;
}

function followPointer(root, pointer) {
  const parts = pointer.split('/').slice(1)
    .map((part) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~'));
  let value = root;
  for (const part of parts) {
    if (value == null || typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}
