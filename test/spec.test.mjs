import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { before, test } from 'node:test';
import { resolveConfig } from '../src/config.mjs';
import { expandSpecPaths, loadSpecs, pathKey } from '../src/spec.mjs';
import { copyFixture, generateInto, ROOT } from './helpers.mjs';

const SPECS = path.join(ROOT, 'test', 'fixtures', 'api-specs');

let routes;
let warnings;
const body = (id) => routes.find((r) => r.id === id).body;
const route = (id) => routes.find((r) => r.id === id);

before(async () => {
  const project = copyFixture();
  ({ routes, warnings } = await generateInto(project, ['--spec', SPECS]));
});

test('uses response examples from the spec as they are', () => {
  assert.deepEqual(body('PetService.getPetById'), {
    id: 10, name: 'doggie', photoUrls: ['https://example.com/doggie.png'], status: 'available',
  });
  assert.equal(body('UserService.loginUser'), 'token-abc123');
  assert.deepEqual(body('PetService.uploadFile'), { code: 200, type: 'success', message: 'uploaded' },
    'schema example reached through allOf and a $ref into another file');
});

test('uses property examples, also across files and from OpenAPI 3.1 examples arrays', () => {
  const [pet] = body('PetService.findPetsByStatus');
  assert.equal(pet.name, 'Bello');
  assert.equal(pet.category.name, 'Dogs');
  assert.equal(body('UserService.getUserByName').username, 'jdoe');
});

test('applies formats and limits', () => {
  const pets = body('PetService.findPetsByStatus');
  assert.equal(pets.length, 2, 'maxItems');
  assert.match(pets[0].birthDate, /^\d{4}-\d{2}-\d{2}$/, 'format: date');

  const order = body('StoreService.getOrderById');
  assert.ok(order.quantity >= 5 && order.quantity <= 9, 'minimum/maximum');
  assert.ok(order.totalPrice <= 10, 'maximum on a double');
  assert.match(order.shipDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(order.complete, false, 'scalar default');
  assert.ok(Object.values(order.metadata).every((v) => v.length <= 3), 'maxLength in additionalProperties');
  assert.ok(Object.values(body('StoreService.getInventory')).every((v) => v >= 100));

  const user = body('UserService.getUserByName');
  assert.match(user.id, /^[0-9a-f-]{36}$/, 'format: uuid');
  assert.match(user.email, /@example\.com$/);
  assert.ok(user.phone.length >= 20, 'minLength on a 3.1 type array');
  assert.ok(user.userStatus < 2, 'exclusiveMaximum as a number (3.1)');
  assert.ok(!('password' in user), 'writeOnly properties are left out');

  const [admin] = body('UserService.listAdmins');
  assert.equal(admin.permissions.length, 2, 'minItems/maxItems through allOf');
  assert.equal(admin.username, 'jdoe', 'properties inherited through allOf');
});

test('takes the success status code from the spec', () => {
  assert.equal(route('StoreService.placeOrder').status, 201);
  assert.equal(route('PetService.deletePet').status, 204);
  assert.equal(route('UserService.logoutUser').status, 204, 'no 2xx in the spec keeps the generated status');
});

test('reports calls that no spec covers and keeps generated data for them', () => {
  assert.ok(warnings.some((w) => /1 calls are not in any spec.*PetService\.getEnclosureShape/.test(w)));
  assert.equal(body('PetService.getEnclosureShape').kind, 'circle');
});

test('reports a spec that matches none of the calls', async () => {
  const project = copyFixture();
  const other = path.join(project, 'other.json');
  writeFileSync(other, JSON.stringify({ openapi: '3.0.3', paths: { '/weather': { get: { responses: {} } } } }));
  const result = await generateInto(project, ['--spec', other, '--spec', SPECS]);
  assert.ok(result.warnings.some((w) => /other\.json matched none/.test(w)));
});

test('reads Swagger 2.0 JSON without js-yaml', () => {
  const dir = path.join(copyFixture(), 'swagger');
  mkdirSync(dir);
  writeFileSync(path.join(dir, 'api.json'), JSON.stringify({
    swagger: '2.0',
    paths: {
      '/store/inventory': {
        get: {
          operationId: 'getInventory',
          responses: { 200: { schema: { $ref: '#/definitions/Inventory' }, examples: { 'application/json': { sold: 3 } } } },
        },
      },
    },
    definitions: { Inventory: { type: 'object' } },
  }));
  const specs = loadSpecs([dir], dir);
  const op = specs.findOperation('GET', '/store/inventory', 'getInventory');
  assert.equal(op.status, 200);
  assert.deepEqual(op.example, { found: true, value: { sold: 3 } });
});

test('matches by operationId when the paths differ', () => {
  const dir = copyFixture();
  const file = path.join(dir, 'api.json');
  writeFileSync(file, JSON.stringify({
    openapi: '3.0.0',
    paths: { '/v2/pets/{id}': { get: { operationId: 'get-pet-by-id', responses: { 200: { description: 'ok' } } } } },
  }));
  const specs = loadSpecs([file], dir);
  assert.ok(specs.findOperation('GET', '/pet/:petId', 'getPetById'));
  assert.equal(specs.findOperation('POST', '/pet/:petId', 'getPetById'), null, 'the method must match');
});

test('folders contribute their spec files, shared files only serve $refs', () => {
  const files = expandSpecPaths([SPECS]).map(({ file }) => path.basename(file));
  assert.deepEqual(files, ['common.yaml', 'petstore.yaml', 'users.yaml']);
  const specs = loadSpecs([SPECS], SPECS);
  assert.deepEqual(specs.specs.map((s) => path.basename(s.file)), ['petstore.yaml', 'users.yaml']);
  assert.deepEqual(specs.warnings, []);
});

test('path keys ignore parameter names', () => {
  assert.equal(pathKey('/pet/{petId}/uploadImage'), pathKey('/pet/:id/uploadImage'));
  assert.equal(pathKey('/pet/'), '/pet');
});

test('specs can be set in the config file and on the command line', () => {
  const project = copyFixture();
  writeFileSync(path.join(project, 'ng-openapi-mock.config.json'), JSON.stringify({ specs: ['../specs/a.yaml'] }));
  assert.deepEqual(resolveConfig(['--project', project]).specs, [path.resolve(project, '../specs/a.yaml')]);
  assert.deepEqual(
    resolveConfig(['--project', project, '--spec', 'x.yaml', '-s', 'y.yaml']).specs,
    [path.join(project, 'x.yaml'), path.join(project, 'y.yaml')],
  );
});

test('fails clearly for a missing spec', async () => {
  const project = copyFixture();
  await assert.rejects(generateInto(project, ['--spec', 'nope.yaml']), /Spec not found/);
});
