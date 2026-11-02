// Custom mock responses. ng-openapi-mock creates this file once and never
// overwrites it, so your changes are kept when you generate again.
//
// The key is <ServiceName>.<methodName> of the generated API client (your
// editor suggests all of them). The value is one of
// - a response body, to mock that call with it
// - MOCK_API_GENERATED, to mock that call with the generated data
//   (only needed in pass-through mode, where unlisted calls aren't mocked)
// - MOCK_API_PASS_THROUGH, to send that call to the real API
//
// Example for mock mode (the default): every call is mocked, the entries
// change single responses or send single calls to the real API.
//
//   export const MOCK_API_OVERRIDES: MockApiOverrides = {
//     // An object body replaces the generated data completely.
//     'PetService.getPetById': {
//       id: 1,
//       name: 'Rex',
//       status: 'available',
//       category: { id: 1, name: 'Dogs' },
//       photoUrls: ['https://example.com/rex.jpg'],
//       tags: [{ id: 1, name: 'friendly' }],
//     },
//     // A list endpoint takes an array. [] mocks an empty list.
//     'PetService.findPetsByStatus': [
//       { id: 1, name: 'Rex', photoUrls: [] },
//       { id: 2, name: 'Bella', photoUrls: [] },
//     ],
//     'PetService.findPetsByTags': [],
//     // A text endpoint takes a string.
//     'UserService.loginUser': 'mock-session-token',
//     // null answers with an empty body.
//     'StoreService.getOrderById': null,
//     // An endpoint that normally returns nothing (204) answers 200 with this body.
//     'PetService.deletePet': { deleted: true },
//     // These calls go to the real API.
//     'UserService.logoutUser': MOCK_API_PASS_THROUGH,
//     'StoreService.placeOrder': MOCK_API_PASS_THROUGH,
//   };
//
// Example for pass-through mode (--mode pass-through): every call goes to the
// real API, only the entries are mocked.
//
//   export const MOCK_API_OVERRIDES: MockApiOverrides = {
//     // Mocked with this body.
//     'StoreService.getInventory': { available: 12, pending: 3, sold: 40 },
//     'UserService.getUserByName': {
//       id: 1,
//       username: 'jdoe',
//       firstName: 'Jane',
//       lastName: 'Doe',
//       email: 'jane.doe@example.com',
//     },
//     // Mocked with the generated data, without writing a body.
//     'StoreService.placeOrder': MOCK_API_GENERATED,
//     'PetService.findPetsByStatus': MOCK_API_GENERATED,
//   };
//
// The service and method names above are examples: use the ones your editor
// suggests. Bodies are not type-checked, so give them the shape your app expects.
//
import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.data';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
};
