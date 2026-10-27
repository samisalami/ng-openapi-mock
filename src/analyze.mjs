const HTTP_VERBS = new Set(['get', 'post', 'put', 'delete', 'patch', 'head', 'options']);

/**
 * Finds every HttpClient call in the generated Angular services and returns
 * one operation per service method: HTTP method, path template and the
 * TypeScript type of the response body.
 */
export function analyzeServices(ts, files) {
  const program = ts.createProgram({
    rootNames: files,
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      experimentalDecorators: true,
      types: [],
    },
  });
  const checker = program.getTypeChecker();
  const operations = [];
  const warnings = [];

  for (const fileName of program.getRootFileNames()) {
    const sourceFile = program.getSourceFile(fileName);
    if (!sourceFile) continue;
    for (const statement of sourceFile.statements) {
      if (!ts.isClassDeclaration(statement) || !statement.name) continue;
      const service = statement.name.text;
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.body || !ts.isIdentifier(member.name)) continue;
        const call = findHttpCall(ts, member.body);
        if (!call) continue;
        const name = member.name.text;
        const variables = collectVariables(ts, member.body);
        const path = normalizePath(urlToPath(ts, call.url, variables, new Set()));
        const type = responseType(ts, checker, statement, name, call.typeArgument);
        operations.push({
          id: `${service}.${name}`,
          service,
          operation: name,
          method: call.method,
          path,
          kind: responseKind(ts, type),
          type,
        });
      }
    }
  }

  const seen = new Map();
  const unique = [];
  for (const op of operations) {
    const key = `${op.method} ${op.path}`;
    if (seen.has(key)) {
      warnings.push(`${op.id} uses the same route as ${seen.get(key)} (${key}), skipped.`);
      continue;
    }
    seen.set(key, op.id);
    unique.push(op);
  }
  return { operations: unique, warnings, checker };
}

function findHttpCall(ts, node) {
  let found = null;
  const visit = (child) => {
    if (found) return;
    const call = matchHttpCall(ts, child);
    if (call) found = call;
    else ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

// Matches this.httpClient.request<T>('get', url, ...) and this.httpClient.get<T>(url, ...).
function matchHttpCall(ts, node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return null;
  const verb = node.expression.name.text;
  const target = node.expression.expression;
  if (!ts.isPropertyAccessExpression(target) || target.expression.kind !== ts.SyntaxKind.ThisKeyword) return null;
  if (!/http/i.test(target.name.text)) return null;
  const typeArgument = node.typeArguments?.[0];
  if (verb === 'request') {
    const [method, url] = node.arguments;
    if (!method || !url || !ts.isStringLiteralLike(method)) return null;
    return { method: method.text.toUpperCase(), url, typeArgument };
  }
  if (HTTP_VERBS.has(verb) && node.arguments[0]) {
    return { method: verb.toUpperCase(), url: node.arguments[0], typeArgument };
  }
  return null;
}

function collectVariables(ts, body) {
  const variables = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      variables.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return variables;
}

function urlToPath(ts, node, variables, seen) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return urlToPath(ts, node.expression, variables, seen);
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      result += placeholder(ts, span.expression, variables, seen) + span.literal.text;
    }
    return result;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return urlToPath(ts, node.left, variables, seen) + urlToPath(ts, node.right, variables, seen);
  }
  return placeholder(ts, node, variables, seen);
}

// Turns an interpolated expression into a path fragment: the base path
// disappears, local variables are inlined, everything else becomes :param.
function placeholder(ts, expr, variables, seen) {
  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    if (variables.has(name) && !seen.has(name)) {
      return urlToPath(ts, variables.get(name), variables, new Set([...seen, name]));
    }
    return /basepath/i.test(name) ? '' : `:${name}`;
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return /basepath/i.test(expr.name.text) ? '' : `:${expr.name.text}`;
  }
  if (ts.isStringLiteralLike(expr) || ts.isTemplateExpression(expr) || ts.isBinaryExpression(expr)) {
    return urlToPath(ts, expr, variables, seen);
  }
  return `:${paramName(ts, expr) ?? 'param'}`;
}

// encodeParam({ name: "petId", ... }) -> petId, encodeURIComponent(String(petId)) -> petId
function paramName(ts, expr) {
  let fromObject = null;
  let firstIdentifier = null;
  const visit = (node) => {
    if (fromObject) return;
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'name'
      && ts.isStringLiteralLike(node.initializer)) {
      fromObject = node.initializer.text;
      return;
    }
    if (ts.isCallExpression(node)) {
      node.arguments.forEach(visit);
      return;
    }
    if (ts.isPropertyAccessExpression(node)) return;
    if (ts.isIdentifier(node) && !firstIdentifier) firstIdentifier = node.text;
    ts.forEachChild(node, visit);
  };
  visit(expr);
  return fromObject ?? firstIdentifier;
}

function normalizePath(raw) {
  let path = raw.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, '').split('?')[0];
  path = ('/' + path).replace(/\/{2,}/g, '/');
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function responseType(ts, checker, classNode, methodName, typeArgument) {
  const isAny = (type) => (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
  if (typeArgument) {
    const type = checker.getTypeFromTypeNode(typeArgument);
    if (!isAny(type)) return type;
  }
  // Fall back to the first overload, the observe: 'body' one: public x(...): Observable<T>
  const overload = classNode.members.find((member) => ts.isMethodDeclaration(member) && !member.body
    && ts.isIdentifier(member.name) && member.name.text === methodName);
  const returnType = overload?.type;
  if (returnType && ts.isTypeReferenceNode(returnType) && returnType.typeArguments?.length) {
    const type = checker.getTypeFromTypeNode(returnType.typeArguments[0]);
    if (!isAny(type)) return type;
  }
  return null;
}

function responseKind(ts, type) {
  if (!type) return 'none';
  const flags = type.flags;
  if (flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never | ts.TypeFlags.Null)) return 'none';
  const symbol = type.getSymbol()?.getName();
  if (symbol === 'Blob' || symbol === 'File') return 'blob';
  if (flags & ts.TypeFlags.String) return 'text';
  return 'json';
}
