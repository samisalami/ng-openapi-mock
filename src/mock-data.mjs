const FIRST_NAMES = ['Anna', 'Ben', 'Clara', 'David', 'Emma', 'Felix', 'Greta', 'Henry'];
const LAST_NAMES = ['Smith', 'Miller', 'Weber', 'Fischer', 'Garcia', 'Brown', 'Schulz', 'Wagner'];

/**
 * Builds plausible, deterministic JSON values for TypeScript types. Values
 * are picked from property names (email, createdAt, price, ...) and count
 * up per property, so arrays contain distinguishable items.
 */
export function createMockFactory(ts, checker, { arrayLength, maxDepth }) {
  const F = ts.TypeFlags;
  const counters = new Map();
  const next = (key) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    return n;
  };
  const isNullish = (t) => (t.flags & (F.Null | F.Undefined | F.Void)) !== 0;
  const isLiteral = (t) => t.isLiteral() || (t.flags & F.BooleanLiteral) !== 0;

  function build(type, name, depth, stack) {
    const flags = type.flags;
    if (flags & (F.Any | F.Unknown)) return {};
    if (flags & (F.Null | F.Undefined | F.Void | F.Never)) return null;
    if (flags & F.BooleanLiteral) return type.intrinsicName === 'true';
    if (flags & F.Boolean) return true;
    if (type.isStringLiteral() || type.isNumberLiteral()) return type.value;
    if (flags & (F.String | F.TemplateLiteral)) return mockString(name, next(`s:${name}`));
    if (flags & (F.Number | F.BigInt)) return mockNumber(name, next(`n:${name}`));

    if (type.isUnion()) {
      const members = type.types.filter((t) => !isNullish(t));
      if (members.length === 0) return null;
      if (members.every(isLiteral)) {
        if (members.every((t) => t.flags & F.BooleanLiteral)) return true;
        const pick = members[(next(`e:${name}`) - 1) % members.length];
        return build(pick, name, depth, stack);
      }
      return build(members[0], name, depth, stack);
    }

    if (checker.isTupleType(type)) {
      return checker.getTypeArguments(type).map((t) => build(t, name, depth + 1, stack));
    }
    if (checker.isArrayType(type)) {
      const [element] = checker.getTypeArguments(type);
      if (!element || depth >= maxDepth || stack.includes(element)) return [];
      const itemName = singular(name);
      return Array.from({ length: arrayLength }, () => build(element, itemName, depth + 1, stack));
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
        const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
        const propertyType = declaration
          ? checker.getTypeOfSymbolAtLocation(property, declaration)
          : checker.getTypeOfSymbol(property);
        if (optional && (depth + 1 >= maxDepth || refersTo(propertyType, innerStack))) continue;
        result[property.getName()] = build(propertyType, property.getName(), depth + 1, innerStack);
      }
      if (properties.length === 0) {
        const index = checker.getIndexInfosOfType(type)[0];
        if (index) {
          for (let i = 1; i <= Math.min(arrayLength, 2); i++) {
            result[`key${i}`] = build(index.type, name, depth + 1, innerStack);
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

  return (type) => build(type, '', 0, []);
}

function mockString(name, n) {
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

function mockNumber(name, n) {
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
