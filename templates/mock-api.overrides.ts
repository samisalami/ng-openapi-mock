// Custom mock responses. ng-openapi-mock creates this file once and never
// overwrites it, so your changes are kept when you generate again.
//
// The key is <ServiceName>.<methodName> of the generated API client (your
// editor suggests all of them). The value is one of
// - a response body, to mock that call with it:
//     'PetService.getPetById': { id: 1, name: 'Rex', photoUrls: [] },
// - MOCK_API_GENERATED, to mock that call with the generated data
//   (only needed in pass-through mode, where unlisted calls aren't mocked):
//     'StoreService.getInventory': MOCK_API_GENERATED,
// - MOCK_API_PASS_THROUGH, to send that call to the real API:
//     'UserService.loginUser': MOCK_API_PASS_THROUGH,
//
import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.data';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
};
