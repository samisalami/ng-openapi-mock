// Custom mock responses. ng-openapi-mock creates this file once and never
// overwrites it, so your changes are kept when you generate again.
//
// The key is "<METHOD> <path>" of an API call, with the path as in the API
// spec (your editor suggests all of them). The value is one of
// - a response body, to mock that call with it
// - MOCK_API_GENERATED, to mock that call with the generated data
//   (only needed in pass-through mode, where unlisted calls aren't mocked)
// - MOCK_API_PASS_THROUGH, to send that call to the real API
//
// Every API call is listed in mock-api.routes.ts, which is updated each time
// you generate. Your editor suggests the keys from there and shows the
// service method and response type of each.
//
// Example for mock mode (the default): every call is mocked, the entries
// change single responses or send single calls to the real API.
//
//   export const MOCK_API_OVERRIDES: MockApiOverrides = {
//     // An object body replaces the generated data completely.
//     'GET /pet/{petId}': {
//       id: 1,
//       name: 'Rex',
//       status: 'available',
//       category: { id: 1, name: 'Dogs' },
//       photoUrls: ['https://example.com/rex.jpg'],
//       tags: [{ id: 1, name: 'friendly' }],
//     },
//     // A list endpoint takes an array. [] mocks an empty list.
//     'GET /pet/findByStatus': [
//       { id: 1, name: 'Rex', photoUrls: [] },
//       { id: 2, name: 'Bella', photoUrls: [] },
//     ],
//     'GET /pet/findByTags': [],
//     // A text endpoint takes a string.
//     'GET /user/login': 'mock-session-token',
//     // null answers with an empty body.
//     'GET /store/order/{orderId}': null,
//     // An endpoint that normally returns nothing (204) answers 200 with this body.
//     'DELETE /pet/{petId}': { deleted: true },
//     // These calls go to the real API.
//     'GET /user/logout': MOCK_API_PASS_THROUGH,
//     'POST /store/order': MOCK_API_PASS_THROUGH,
//   };
//
// Example for pass-through mode (--mode pass-through): every call goes to the
// real API, only the entries are mocked.
//
//   export const MOCK_API_OVERRIDES: MockApiOverrides = {
//     // Mocked with this body.
//     'GET /store/inventory': { available: 12, pending: 3, sold: 40 },
//     'GET /user/{username}': {
//       id: 1,
//       username: 'jdoe',
//       firstName: 'Jane',
//       lastName: 'Doe',
//       email: 'jane.doe@example.com',
//     },
//     // Mocked with the generated data, without writing a body.
//     'POST /store/order': MOCK_API_GENERATED,
//     'GET /pet/findByStatus': MOCK_API_GENERATED,
//   };
//
// The routes above are examples. Bodies are not type-checked, so give them
// the shape your app expects: the response type in mock-api.routes.ts helps.
//
import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.routes';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
};
