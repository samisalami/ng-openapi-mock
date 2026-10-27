const FIRST_NAMES = ['Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Henry'];
const LAST_NAMES = ['Smith', 'Miller', 'Weber', 'Fischer', 'Garcia', 'Brown', 'Schulz', 'Wagner'];

/**
 * Builds plausible, deterministic JSON values for TypeScript types. Values
 * are picked from property names (email, createdAt, price, ...) and count
 * up per property, so arrays contain distinguishable items.
 *
 * With OpenAPI specs loaded, the matching schema is walked alongside the
 * type: its examples win, and its formats and limits shape generated values.
 */
export function createMockFactory(ts, checker, { arrayLength, maxDepth }, specs = null) {
  const F = ts.TypeFlags;
  const counters = new Map();
  const next = (key) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return n;
  };
  const isNullish = (t) => (t.flags & (F.Null | F.Undefined | F.Void)) !== 0;
  const isLiteral = (t) => t.isLiteral() || (t.flags & F.BooleanLiteral) !== 0;
  const sub = (fn, schema, ...args) => (specs && schema ? fn(schema, ...args) : null);

  function build(type, name, depth, stack, schema) {
    const rules = specs && schema ? specs.info(schema) : {};
    if (specs && schema) {
      const example = specs.example(schema);
      if (example.found) return structuredClone(example.value);
    }

    const flags = type.flags;
    if (flags & (F.Any | F.Unknown)) return {};
    if (flags & (F.Null | F.Undefined | F.Void | F.Never)) return null;
    if (flags & F.BooleanLiteral) return type.intrinsicName === 'true';
    if (flags & F.Boolean) return true;
    if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
    if (flags & (F.String | F.TemplateLiteral)) return mockString(name, next(`s:${name}`), rules);
    if (flags & (F.Number | F.BigInt)) return mockNumber(name, next(`n:${name}`), rules);

    if (type.isUnion()) {
      const members = type.types.filter((t) => !isNullish(t));
      if (members.length === 0) return null;
      if (members.every(isLiteral)) {
        if (members.every((t) => t.flags & F.BooleanLiteral)) return true;
        const pick = members[(next(`e:${name}`) - 1) % members.length];
        return build(pick, name, depth, stack, schema);
      }
      // A oneOf/anyOf: use the first variant, and the matching spec variant.
      const variant = members.length > 1 ? sub(specs?.variant, schema, 0) : null;
      return build(members[0], name, depth, stack, variant ?? schema);
    }

    if (checker.isTupleType(type)) {
      return checker.getTypeArguments(type).map((t) => build(t, name, depth + 1, stack, null));
    }
    if (checker.isArrayType(type)) {
      const [element] = checker.getTypeArguments(type);
      if (!element || depth >= maxDepth || stack.includes(element)) return [];
      const itemName = singular(name);
      const itemSchema = sub(specs?.items, schema);
      const length = clamp(arrayLength, rules.minItems, rules.maxItems);
      return Array.from({ length }, () => build(element, itemName, depth + 1, stack, itemSchema));
    }

    const symbolName = type.getSymbol()?.getName();
    if (symbolName === 'Date') return mockDate(next(`d:${name}`));
    if (symbolName === 'Blob' || symbolName === 'File') return null;

    if (flags & F.Object || type.isIntersection()) {
      if (stack.includes(type) || depth >= maxDepth) return {};
      const innerStack = [...stack, type];
      const result = {};
      const properties = checker.getPropertiesOfType(type);
      for (const property of properties) {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        if (declaration && (ts.isMethodSignature(declaration) || ts.isMethodDeclaration(declaration))) continue;
        const propertySchema = sub(specs?.property, schema, property.getName());
        // writeOnly properties (passwords, ...) never appear in responses.
        if (propertySchema && specs.info(propertySchema).writeOnly) continue;
        const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
        const propertyType = declaration
          ? checker.getTypeOfSymbolAtLocation(property, declaration)
          : checker.getTypeOfSymbol(property);
        if (optional && (depth + 1 >= maxDepth || refersTo(propertyType, innerStack))) continue;
        result[property.getName()] = build(propertyType, property.getName(), depth + 1, innerStack, propertySchema);
      }
      if (properties.length === 0) {
        const index = checker.getIndexInfosOfType(type)[0];
        if (index) {
          const valueSchema = sub(specs?.additional, schema);
          for (let i = 1; i <= Math.min(arrayLength, 2); i++) {
            result[`key${i}`] = build(index.type, name, depth + 1, innerStack, valueSchema);
          }
        }
      }
      return result;
    }
    return null;
  }

  function refersTo(type, stack) {
    const members = type.isUnion() ? type.types : [type];
    return members.some((t) => stack.includes(t)
      || (checker.isArrayType(t) && stack.includes(checker.getTypeArguments(t)[0])));
  }

  return (type, schema = null) => build(type, '', 0, [], schema);
}

function mockString(name, n, rules = {}) {
  const value = (rules.format && stringForFormat(rules.format, name, n)) ?? stringFromName(name, n);
  let result = value;
  if (Number.isInteger(rules.minLength) && result.length < rules.minLength) result = result.padEnd(rules.minLength, 'x');
  if (Number.isInteger(rules.maxLength) && result.length > rules.maxLength) result = result.slice(0, rules.maxLength);
  return result;
}

function stringForFormat(format, name, n) {
  switch (format) {
    case 'date': return mockDate(n).slice(0, 10);
    case 'date-time': return mockDate(n);
    case 'time': return '10:00:00';
    case 'uuid': return uuid(n);
    case 'email':
    case 'idn-email': return `user${n}@example.com`;
    case 'uri':
    case 'url':
    case 'uri-reference':
    case 'iri': return `https://example.com/${name.toLowerCase() || 'resource'}/${n}`;
    case 'hostname': return 'example.com';
    case 'ipv4': return `192.0.2.${n % 255}`;
    case 'ipv6': return `2001:db8::${n.toString(16)}`;
    case 'byte': return Buffer.from(`mock ${n}`).toString('base64');
    case 'password': return 'secret';
    default: return null;
  }
}

function stringFromName(name, n) {
  const key = name.toLowerCase();
  const pickFrom = (list) => list[(n - 1) % list.length];
  if (!key) return `string ${n}`;
  if (/e-?mail/.test(key)) return `user${n}@example.com`;
  if (/password|secret/.test(key)) return 'secret';
  if (/uuid|guid/.test(key) || key === 'id' || /[a-z]Id$/.test(name) || key.endsWith('_id')) return uuid(n);
  if (/date|time|timestamp|birthday/.test(key) || /[a-z](At|On)$/.test(name)) return mockDate(n);
  if (/(image|photo|avatar|picture|thumbnail|logo)/.test(key)) return `https://example.com/images/${n}.png`;
  if (/(url|uri|href|link|website)s?$/.test(key)) return `https://example.com/${key}/${n}`;
  if (/phone|mobile|fax/.test(key)) return `+49 30 ${1000000 + n}`;
  if (/first_?name|given_?name/.test(key)) return pickFrom(FIRST_NAMES);
  if (/last_?name|family_?name|surname/.test(key)) return pickFrom(LAST_NAMES);
  if (/user_?name|login|nickname/.test(key)) return `user${n}`;
  if (/currency/.test(key)) return 'EUR';
  if (/country/.test(key)) return 'DE';
  if (/language|locale|lang$/.test(key)) return 'de';
  if (/zip|postal|postcode/.test(key)) return String(10115 + n);
  if (/city|town/.test(key)) return pickFrom(['Berlin', 'Hamburg', 'Munich', 'Cologne']);
  if (/street|address/.test(key)) return `Main Street ${n}`;
  if (/colou?r/.test(key)) return pickFrom(['#3366ff', '#ff6633', '#33cc99']);
  if (/token|key|hash/.test(key)) return `${key}-${n.toString(16).padStart(8, '0')}`;
  if (/description|comment|note|text|message|summary|content|body/.test(key)) {
    return `Lorem ipsum dolor sit amet ${n}.`;
  }
  if (/name|title|label/.test(key)) return `${capitalize(name)} ${n}`;
  return `${name} ${n}`;
}

function mockNumber(name, n, rules = {}) {
  const type = Array.isArray(rules.type) ? rules.type.find((t) => t !== 'null') : rules.type;
  const integer = type === 'integer' || /^int(32|64)$/.test(rules.format ?? '');
  let value = numberFromName(name, n);
  if (integer) value = Math.round(value);
  else if (/^(float|double)$/.test(rules.format ?? '') && Number.isInteger(value)) value += 0.5;

  // exclusiveMinimum/-Maximum are numbers in OpenAPI 3.1 and flags in 3.0.
  const step = integer ? 1 : 0.01;
  const min = typeof rules.exclusiveMinimum === 'number' ? rules.exclusiveMinimum + step
    : rules.minimum != null ? rules.minimum + (rules.exclusiveMinimum === true ? step : 0) : undefined;
  const max = typeof rules.exclusiveMaximum === 'number' ? rules.exclusiveMaximum - step
    : rules.maximum != null ? rules.maximum - (rules.exclusiveMaximum === true ? step : 0) : undefined;
  return clamp(value, min, max);
}

function numberFromName(name, n) {
  const key = name.toLowerCase();
  if (!key || key === 'id' || /id$/.test(key)) return n;
  if (/price|amount|total|cost|fee|balance|sum/.test(key)) return Math.round(n * 1999) / 100;
  if (/percent|ratio|rate|score/.test(key)) return Math.min(n * 10, 100);
  if (/^lat/.test(key)) return 52.52;
  if (/^(lng|lon)/.test(key)) return 13.405;
  if (/year/.test(key)) return 2024;
  if (/age/.test(key)) return 25 + n;
  return n;
}

function clamp(value, min, max) {
  if (typeof min === 'number' && value < min) return min;
  if (typeof max === 'number' && value > max) return max;
  return value;
}

function mockDate(n) {
  return new Date(Date.UTC(2024, 0, n, 10, 0, 0)).toISOString();
}

function uuid(n) {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function singular(name) {
  if (/ies$/.test(name)) return name.slice(0, -3) + 'y';
  if (/s$/.test(name) && !/ss$/.test(name)) return name.slice(0, -1);
  return name;
}

function capitalize(name) {
  const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
