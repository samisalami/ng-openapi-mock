// Custom mock responses. ng-openapi-mock creates this file once and never
// overwrites it, so your changes are kept when you generate again.
//
// The key is <ServiceName>.<methodName> of the generated API client (your
// editor suggests all of them). The value is either
// - the response body, to replace the generated one:
//     'PetService.getPetById': { id: 1, name: 'Rex', photoUrls: [] },
// - or MOCK_API_PASS_THROUGH, to send that call to the real API:
//     'UserService.loginUser': MOCK_API_PASS_THROUGH,
//
import { MockApiOverrides, MOCK_API_PASS_THROUGH } from './mock-api.data';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
};
