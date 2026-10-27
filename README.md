# ng-openapi-mock

Generates mock data for an Angular project whose API client was created with
[openapi-generator](https://openapi-generator.tech) (`typescript-angular`), together with an
Angular interceptor that answers the app's API calls with it. You don't need a backend or
a separate server: `ng serve` is enough.

You don't need to change the Angular project's `package.json` and nothing gets installed
into it.

## Requirements

- Windows, PowerShell or Git Bash (macOS and Linux work too)
- Node.js 22.15.0 or newer
- An Angular project that has its API client generated, so a `.openapi-generator`
  folder with a `FILES` list exists somewhere inside it, and that has had `npm install`

You don't need admin rights or a global install.

## Setup

Get a copy of this repository once and put it anywhere you like, for example
`C:/tools/ng-openapi-mock`. Either way works:

- **Download the ZIP**: on GitHub, click **Code → Download ZIP** and unpack it. The ZIP
  contains a folder named `ng-openapi-mock-main`. Rename it or use that path in the
  commands below.
- **or clone it**:

  ```bash
  git clone git@github.com:samisalami/ng-openapi-mock.git C:/tools/ng-openapi-mock
  ```

To update later, download the ZIP again and replace the folder, or run `git pull` in it.

You don't need to run `npm install` for it. It uses the TypeScript that your Angular
project already has.

## Generate the mocks

Run this in the root folder of your Angular project:

```bash
node C:/tools/ng-openapi-mock/bin/ng-openapi-mock.mjs
```

> [!IMPORTANT]
> **In Git Bash, don't paste paths from Windows Explorer as they are.** Git Bash treats
> `\` as an escape character, so `C:\tools\ng-openapi-mock` turns into
> `C:toolsng-openapi-mock` and the command fails. Either:
>
> - use forward slashes: `C:/tools/ng-openapi-mock/bin/ng-openapi-mock.mjs`
> - or put the path in quotes: `"C:\tools\ng-openapi-mock\bin\ng-openapi-mock.mjs"`
>
> This applies to every path, including options such as `--generator-dir`. PowerShell
> accepts both forms as they are.

That's all you need in most projects. The tool finds the `.openapi-generator` folder,
reads the generated services and models, and writes three files into `src/app/mock-api/`:

| File | What it is | On the next run |
| --- | --- | --- |
| `mock-api.interceptor.ts` | the interceptor you register in the app | replaced |
| `mock-api.data.ts` | the generated mock responses | replaced |
| `mock-api.overrides.ts` | your [custom responses](#custom-responses) | **kept**, never overwritten |

Run the command again whenever the API client is regenerated.

## Use the interceptor

Register it in `app.config.ts`:

```ts
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { mockApiInterceptor } from './mock-api/mock-api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([mockApiInterceptor])),
  ],
};
```

If `provideHttpClient` is already there, add `withInterceptors([mockApiInterceptor])` to it.
If it already has `withInterceptors`, add `mockApiInterceptor` to that list.

Then start the app the way you always do. Nothing about starting the app changes:
`npm start`, `npx ng serve`, your own npm scripts, proxy configs and environment
configurations all keep working. `ng serve` is only the plain default; any start command
that runs the app in development mode uses the mocks.

Mocked API calls get an answer right away, and every other request (assets,
translations, endpoints without a mock) goes through as normal. It doesn't matter which
address the API client sends its calls to: `/api/pet/5`, `/pet/5` and
`https://api.example.com/v1/pet/5` all get the `/pet/{petId}` mock.

### See mocked calls in the console

Mocked calls never reach the network, so they **don't show up in the browser's Network
tab**. Instead, each one is logged to the browser console (F12 → **Console**) when its
response arrives:

```
[mock] GET /api/pet/7?details=true → 200 PetService.getPetById (generated, 0 ms)
```

Click a line to open it and see the request body and the response body. Each line also
shows whether the response came from your [overrides](#custom-responses) or from the
generated data, and how long it took (including `--delay`). Calls that aren't mocked go
to the network as usual and show up in the Network tab.

Logging is on by default. To turn it off, generate with `--no-log` or set `"log": false`
in the [config file](#options).

### Only in development mode

The interceptor only works in development mode, so it's safe if the registration gets
committed by accident:

- `ng serve` and development builds use the mocks.
- Production builds (`ng build` with the default production configuration) ignore it.
  Every request goes to the real API, and the mock data isn't even included in the bundle.

If a non-production environment (for example staging) is built with the production
configuration, the mocks are off there too.

## Custom responses

To replace a generated response, add an entry to `src/app/mock-api/mock-api.overrides.ts`.
The key is the service class and method of the generated API client, and the value is
the response body:

```ts
import { MockApiOverrides } from './mock-api.data';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
  'PetService.getPetById': { id: 1, name: 'Rex', photoUrls: [] },
  'StoreService.getInventory': { available: 12, sold: 3 },
};
```

- Your editor suggests all available keys, and a typo is a compile error.
- `ng serve` picks up changes right away. You don't need to run the generator again.
- The generator creates this file once and never overwrites it.
- Endpoints that return nothing respond with `204 No Content`. An override for one of them
  is sent as `200` with your body.

If an endpoint is removed from the API, the generator removes its key, and `ng serve`
shows an error for your override until you delete it.

## Options

You can pass options on the command line or put them in `ng-openapi-mock.config.json`
in the project root (command line wins).

| Option | Config key | Default | Description |
| --- | --- | --- | --- |
| `--project <dir>` | – | current folder | Angular project root |
| `--generator-dir <dir>` | `generatorDir` | found automatically | The `.openapi-generator` folder |
| `--base-dir <dir>` | `baseDir` | `src/app` | Folder the paths in `FILES` are relative to |
| `--out <dir>` | `out` | `src/app/mock-api` | Where the files are written |
| `--delay <ms>` | `delay` | `0` | Delay before each mocked response |
| `--no-log` | `log` | `true` | Turn off logging mocked calls to the browser console |
| `--array-length <n>` | `arrayLength` | `3` | Number of items in generated lists |
| `--max-depth <n>` | `maxDepth` | `4` | How deep nested objects are filled |
| `--config <file>` | – | `ng-openapi-mock.config.json` | Use a different config file |

Paths are relative to the project root. Example config file:

```json
{
  "generatorDir": "src/app/core/api/generated/.openapi-generator",
  "baseDir": "src/app",
  "out": "src/app/core/mock-api",
  "delay": 300
}
```

If you change `out`, import the interceptor from that folder in `app.config.ts`.

If your project has more than one `.openapi-generator` folder, the tool lists them and asks
you to pick one with `--generator-dir`.

## Troubleshooting

- **"TypeScript was not found"**: run `npm install` in the Angular project first.
- **"Listed in FILES but not found"**: the paths in `FILES` aren't relative to `src/app`.
  Set `--base-dir` to the right folder. If they're relative to the folder that contains
  `.openapi-generator`, they're found automatically.
- **`Cannot find module 'C:Users...'` in Git Bash**: the path was pasted with backslashes
  and without quotes. Use forward slashes or quotes. See the note under
  [Generate the mocks](#generate-the-mocks).
- **API calls still reach the real backend**: check that the interceptor is registered in
  `app.config.ts` and that the app runs in development mode (`ng serve`, not a
  production build).
- **A `mock-server/` folder from an older version**: it isn't used any more. Delete it.

## Developing this tool

```bash
npm install
npm test
```
