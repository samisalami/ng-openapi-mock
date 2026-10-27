import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { sortRoutes, toPattern } from '../src/generate.mjs';
import { copyFixture, generateInto } from './helpers.mjs';

test('extracts every operation with method, path and response kind', async () => {
  const project = copyFixture();
  const { routes } = await generateInto(project);
  const summary = Object.fromEntries(routes.map((r) => [r.id, `${r.method} ${r.path} ${r.status} ${r.kind}`]));
  assert.deepEqual(summary, {
    'PetService.addPet': 'POST /pet 200 json',
    'PetService.deletePet': 'DELETE /pet/:petId 204 none',
    'PetService.findPetsByStatus': 'GET /pet/findByStatus 200 json',
    'PetService.getPetById': 'GET /pet/:petId 200 json',
    'PetService.getEnclosureShape': 'GET /pet/:petId/enclosure 200 json',
    'PetService.uploadFile': 'POST /pet/:petId/uploadImage 200 json',
    'StoreService.deleteOrder': 'DELETE /store/order/:orderId 204 none',
    'StoreService.getInventory': 'GET /store/inventory 200 json',
    'StoreService.getOrderById': 'GET /store/order/:orderId 200 json',
    'StoreService.placeOrder': 'POST /store/order 200 json',
    'UserService.downloadUserReport': 'GET /user/:username/report 200 blob',
    'UserService.getUserByName': 'GET /user/:username 200 json',
    'UserService.listAdmins': 'GET /user/admins 200 json',
    'UserService.loginUser': 'GET /user/login 200 text',
    'UserService.logoutUser': 'GET /user/logout 204 none',
    'UserService.updateUser': 'PUT /user/:username 204 none',
  });
});

test('builds mock bodies that follow the model types', async () => {
  const project = copyFixture();
  const { routes } = await generateInto(project);
  const body = (id) => routes.find((r) => r.id === id).body;

  const pet = body('PetService.getPetById');
  assert.equal(typeof pet.name, 'string');
  assert.equal(pet.photoUrls.length, 3);
  assert.ok(['available', 'pending', 'sold'].includes(pet.status));
  assert.ok(!('children' in pet.category), 'recursive optional property is left out');

  const pets = body('PetService.findPetsByStatus');
  assert.equal(pets.length, 3);
  assert.notEqual(pets[0].id, pets[1].id);

  const order = body('StoreService.getOrderById');
  assert.ok(['placed', 'approved', 'delivered'].includes(order.status));
  assert.equal(typeof order.totalPrice, 'number');
  assert.ok(!Number.isNaN(Date.parse(order.shipDate)));

  const admins = body('UserService.listAdmins');
  assert.match(admins[0].email, /@example\.com$/, 'inherited properties are filled');
  assert.ok(admins[0].permissions.every((p) => ['read', 'write', 'delete'].includes(p)));

  assert.equal(body('PetService.getEnclosureShape').kind, 'circle');
  assert.deepEqual(Object.keys(body('StoreService.getInventory')), ['key1', 'key2']);
  assert.equal(typeof body('UserService.loginUser'), 'string');
});

test('output is the same on every run', async () => {
  const project = copyFixture();
  await generateInto(project);
  const first = readFileSync(path.join(project, 'src', 'app', 'mock-api', 'mock-api.data.ts'), 'utf8');
  await generateInto(project);
  assert.equal(readFileSync(path.join(project, 'src', 'app', 'mock-api', 'mock-api.data.ts'), 'utf8'), first);
});

test('writes the interceptor, its data and an overrides file', async () => {
  const project = copyFixture();
  await generateInto(project);
  const out = path.join(project, 'src', 'app', 'mock-api');
  assert.deepEqual(readdirSync(out).sort(), ['mock-api.data.ts', 'mock-api.interceptor.ts', 'mock-api.overrides.ts']);
  assert.match(readFileSync(path.join(out, 'mock-api.data.ts'), 'utf8'), /\| "PetService\.getPetById"/);
});

test('--out changes the output folder', async () => {
  const project = copyFixture();
  await generateInto(project, ['--out', 'src/app/core/mocks']);
  assert.ok(existsSync(path.join(project, 'src', 'app', 'core', 'mocks', 'mock-api.interceptor.ts')));
});

test('never overwrites the overrides file', async () => {
  const project = copyFixture();
  await generateInto(project);
  const overrides = path.join(project, 'src', 'app', 'mock-api', 'mock-api.overrides.ts');
  writeFileSync(overrides, '// mine');
  await generateInto(project);
  assert.equal(readFileSync(overrides, 'utf8'), '// mine');
});

test('route patterns match any base path and prefer static segments', () => {
  const pattern = new RegExp(toPattern('/pet/:petId'));
  assert.ok(pattern.test('/pet/5'));
  assert.ok(pattern.test('/api/v3/pet/5'));
  assert.ok(!pattern.test('/pet/5/enclosure'));
  assert.ok(!pattern.test('/carpet/5'));

  const sorted = sortRoutes([
    { path: '/pet/:petId', method: 'GET' },
    { path: '/pet', method: 'GET' },
    { path: '/pet/findByStatus', method: 'GET' },
    { path: '/pet/:petId/enclosure', method: 'GET' },
  ]).map((r) => r.path);
  assert.deepEqual(sorted, ['/pet/:petId/enclosure', '/pet/findByStatus', '/pet/:petId', '/pet']);
});
