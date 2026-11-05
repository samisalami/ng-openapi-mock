# ng-openapi-mock

Generates mock data for an Angular project whose API client was created with
[openapi-generator](https://openapi-generator.tech) (`typescript-angular`), together with an
Angular interceptor that answers the app's API calls with it. You don't need a separate
server: `ng serve` is enough.

By default, the app keeps talking to the real API and only the calls you pick are
mocked. If you don't have a backend at all, [mock mode](#custom-responses-and-real-api-calls)
mocks every call.

You don't need to change the Angular project's `package.json` and nothing gets installed
into it.

## Requirements

- Windows, PowerShell or Git Bash (macOS and Linux work too)
- Node.js 22.15.0 or newer
- An Angular project that has its API client generated, so a `.openapi-generator`
  folder with a `FILES` list exists somewhere inside it, and that has had `npm install`
- Only if you use [OpenAPI specs](#better-mock-data-from-openapi-specs) in `.yaml` format:
  `js-yaml` in the Angular project's `node_modules`. JSON specs don't need it.

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

### Optional: run it as `ng-openapi-mock`

Add the tool's `bin` folder to your `PATH` once, and you can type `ng-openapi-mock` in
PowerShell, cmd and Git Bash instead of the full `node C:/tools/…` command. It works
without admin rights:

1. Open the Start menu, search for **"Edit environment variables for your account"** and
   open it.
2. Select **Path** under "User variables", click **Edit**, then **New**.
3. Enter the `bin` folder, for example `C:\tools\ng-openapi-mock\bin`. Use the `bin`
   folder, not the `.mjs` file inside it.
4. Click **OK** in both windows, then close and reopen your terminals (and VS Code, if you
   use its terminal). Terminals that were already open don't see the change.

To check, run `ng-openapi-mock --version`.

## Generate the mocks

Run this in the root folder of your Angular project:

```bash
ng-openapi-mock
```

or, without the [PATH setup](#optional-run-it-as-ng-openapi-mock):

```bash
node C:/tools/ng-openapi-mock/bin/ng-openapi-mock.mjs
```

All options work the same with both forms, for example `ng-openapi-mock --no-log`.

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
reads the generated services and models, and writes four files into `src/app/mock-api/`:

| File | What it is | On the next run |
| --- | --- | --- |
| `mock-api.interceptor.ts` | the interceptor you register in the app | replaced |
| `mock-api.data.ts` | the generated mock responses | replaced |
| `mock-api.routes.ts` | every API call, to look up keys for your overrides | replaced |
| `mock-api.overrides.ts` | your [custom responses and pass-throughs](#custom-responses-and-real-api-calls) | **kept**, never overwritten |

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

Right after setup, nothing is mocked yet: every call still goes to the real API. List
the calls you want mocked in the [overrides file](#custom-responses-and-real-api-calls),
or generate with `--mode mock` to mock all of them.

Mocked API calls get an answer right away, and every other request (assets,
translations, endpoints without a mock) goes through as normal. It doesn't matter which
address the API client sends its calls to: `/api/pet/5`, `/pet/5` and
`https://api.example.com/v1/pet/5` all get the `/pet/{petId}` mock.

### Commit the registration for the whole team

If only some developers use the mocks and `src/app/mock-api/` is in `.gitignore`, the
import above breaks the app for everyone else. Instead, import the interceptor through
an alias that falls back to a small stub you commit. Developers who generated the mocks
get the mocks; everyone else gets the stub, which sends every request to the real API.

Set it up once and commit the result:

1. Generate with `--stub`:

   ```bash
   ng-openapi-mock --stub
   ```

   This creates `src/app/mock-api.stub.ts` (next to the `mock-api` folder, so it isn't
   ignored) and prints the line to add to your `tsconfig.json`:

   ```json
   "paths": {
     "@mock-api": ["./src/app/mock-api/mock-api.interceptor.ts", "./src/app/mock-api.stub.ts"]
   }
   ```

   The generated interceptor comes first, the stub second: the first file that exists is
   used. If `"paths"` already exists, add just the `"@mock-api"` line to it.
2. Import the interceptor from the alias in `app.config.ts`:

   ```ts
   import { mockApiInterceptor } from '@mock-api';
   ```

3. Commit `mock-api.stub.ts`, `tsconfig.json` and `app.config.ts`. Keep
   `src/app/mock-api/` in `.gitignore`.

Run with `--stub` again any time to check the setup: it prints nothing more once the
alias is right, and never overwrites the stub. Developers who use the mocks don't need
`--stub` for their normal runs.

> [!IMPORTANT]
> Restart `ng serve` after you generate the mocks for the first time, or after deleting
> the `mock-api` folder. A running `ng serve` keeps using the file it found when it
> started. Later runs of the generator don't need a restart.

Production builds and CI never have the mocks, so they use the stub. A local production
build with the mocks works too: the interceptor is [off in production](#only-in-development-mode).

### See mocked calls in the console

Mocked calls never reach the network, so they **don't show up in the browser's Network
tab**. Instead, each one is logged to the browser console (F12 → **Console**) when its
response arrives:

```
[mock] GET /api/pet/7?details=true → 200 'GET /pet/{petId}' (generated, 0 ms)
```

Click a line to open it and see the request body and the response body. The quoted part
is the key for that call in the [overrides file](#custom-responses-and-real-api-calls),
ready to copy. Each line also shows whether the response came from your [overrides](#custom-responses-and-real-api-calls) or from the
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

## Custom responses and real API calls

`src/app/mock-api/mock-api.overrides.ts` decides per call what happens. The key is the
HTTP method and path of the call, with the path as in the API spec, e.g.
`'GET /pet/{petId}'`. The base path of your API isn't part of it. The value is one of:

| Value | The call is… |
| --- | --- |
| a response body, e.g. `{ id: 1, name: 'Rex' }` | mocked with that body |
| `MOCK_API_GENERATED` | mocked with the generated data |
| `MOCK_API_PASS_THROUGH` | sent to the real API, as if the interceptor weren't there |

What happens to calls that **aren't** listed depends on the mode you generate with:

| Mode | Calls not in the overrides file | Typical use |
| --- | --- | --- |
| `pass-through` (default) | sent to the real API | a working backend, and only a few endpoints should be mocked |
| `mock` | mocked with the generated data | no backend, or only a few endpoints should be real |

To mock everything, generate with `--mode mock`, or put `"mode": "mock"` in the
[config file](#options). Switching modes needs one run of the generator; your overrides
file stays as it is.

**Pass-through mode** (default), use the real API except for two endpoints that aren't
ready yet:

```ts
import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.routes';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
  'GET /store/inventory': { available: 12, sold: 3 },  // custom response
  'POST /store/order': MOCK_API_GENERATED,             // generated data
};
```

**Mock mode**, mock everything except login:

```ts
import { MockApiOverrides, MOCK_API_GENERATED, MOCK_API_PASS_THROUGH } from './mock-api.routes';

export const MOCK_API_OVERRIDES: MockApiOverrides = {
  'GET /pet/{petId}': { id: 1, name: 'Rex', photoUrls: [] },  // custom response
  'GET /user/login': MOCK_API_PASS_THROUGH,                     // real API
};
```

- Your editor suggests all available keys and shows the service method and response type
  of each, and a typo is a compile error.
- All keys are listed in `mock-api.routes.ts`, grouped by service. The generator updates
  that file on every run, so new endpoints show up there and in the suggestions right
  away:

  ```ts
  // PetService
  /** PetService.getPetById → 200 Pet */
  readonly "GET /pet/{petId}"?: unknown;
  /** PetService.findPetsByStatus → 200 Pet[] */
  readonly "GET /pet/findByStatus"?: unknown;
  ```

- The app picks up changes right away. You don't need to run the generator again.
- The generator creates this file once and never overwrites it.
- Calls that go to the real API show up in the Network tab like any real request. If
  [logging](#see-mocked-calls-in-the-console) is on, calls set to `MOCK_API_PASS_THROUGH`
  also get a `[mock] … → real API` line in the console, so you can see the setting took
  effect. Unlisted calls in pass-through mode don't, to keep the console readable.
- With logging on, the console also says which mode is active when the first API call is
  made.
- Endpoints that return nothing respond with `204 No Content`. An override for one of them
  is sent as `200` with your body.

> [!NOTE]
> If your overrides file was created by an older version, it keeps working as it is: its
> import from `./mock-api.data` and its keys like `'PetService.getPetById'` (service and
> method name) are still supported, and you can mix them with the new keys. Add
> `MOCK_API_GENERATED` and `MOCK_API_PASS_THROUGH` to its import line as far as you use
> them.

If an endpoint is removed from the API, the generator removes its key, and `ng serve`
shows an error for your override until you delete it.

## Better mock data from OpenAPI specs

Without specs, the generator only knows the TypeScript types, so it guesses values from
field names. If you have the OpenAPI specs (`.yaml` or `.json`) the API client was
generated from, pass them with `--spec` and the mocks get much closer to real data. The
specs can live anywhere, for example in another repository next to your project:

```bash
ng-openapi-mock --spec ../api-specs/orders.yaml --spec ../api-specs/customers.yaml
```

or pass a folder to use every `.yaml`, `.yml` and `.json` file directly inside it:

```bash
ng-openapi-mock --spec ../api-specs
```

To avoid typing this every time, put the paths in the [config file](#options):
`"specs": ["../api-specs"]`.

**What the specs add:**

| From the spec | Effect on the mocks |
| --- | --- |
| `example` / `examples` on a response | used as the response, exactly as written |
| `example` / `examples` on a schema or field | used for that object or field |
| `default` (text, numbers, true/false) | used for that field |
| `format` (`date`, `date-time`, `uuid`, `email`, `uri`, `int64`, `double`, …) | values in that format |
| `minimum`/`maximum`, `minLength`/`maxLength`, `minItems`/`maxItems` | values within those limits |
| `writeOnly` | field left out of responses (for example passwords) |
| success status (`201`, `204`, …) | used as the response status |

**What stays the same:** which calls get mocked, the keys in `mock-api.overrides.ts`
and the types all still come from the app's generated client. Your overrides always win
over the specs.

**Good to know:**

- Each call is matched to the specs by HTTP method and path (`/pet/{petId}` matches
  `/pet/:petId`), and by `operationId` if the paths differ. Several specs are fine; they
  don't need to be one file.
- The generator prints how many calls it matched. Calls that no spec covers use generated
  data and are listed as a warning. A spec that matches no call at all also gets a
  warning, which usually means the wrong file.
- OpenAPI 3.0, 3.1 and Swagger 2.0 are detected from the `openapi:` / `swagger:` line.
- `$ref`s within a file and to other files (`$ref: './common.yaml#/...'`) both work.
  Files without an `openapi:` line in a spec folder are only used as `$ref` targets.
- A field with an example has the same value in every list item. That's what the spec
  says, so it's expected.
- `.yaml` specs need `js-yaml` in the Angular project's `node_modules`.

## Options

You can pass options on the command line or put them in `ng-openapi-mock.config.json`
in the project root (command line wins).

| Option | Config key | Default | Description |
| --- | --- | --- | --- |
| `--project <dir>` | – | current folder | Angular project root |
| `--generator-dir <dir>` | `generatorDir` | found automatically | The `.openapi-generator` folder |
| `--base-dir <dir>` | `baseDir` | `src/app` | Folder the paths in `FILES` are relative to |
| `--out <dir>` | `out` | `src/app/mock-api` | Where the files are written |
| `--mode <mode>` | `mode` | `pass-through` | `pass-through` or `mock`, see [modes](#custom-responses-and-real-api-calls) |
| `--spec <file or folder>` | `specs` (list) | – | [OpenAPI specs](#better-mock-data-from-openapi-specs) for better mock data. Repeat for several |
| `--delay <ms>` | `delay` | `0` | Delay before each mocked response |
| `--no-log` | `log` | `true` | Turn off logging mocked calls to the browser console |
| `--stub` | `stub` | `false` | Create the stub and check the alias for [team setups](#commit-the-registration-for-the-whole-team) |
| `--array-length <n>` | `arrayLength` | `3` | Number of items in generated lists |
| `--max-depth <n>` | `maxDepth` | `4` | How deep nested objects are filled |
| `--config <file>` | – | `ng-openapi-mock.config.json` | Use a different config file |

Paths are relative to the project root. Example config file:

```json
{
  "generatorDir": "src/app/core/api/generated/.openapi-generator",
  "baseDir": "src/app",
  "out": "src/app/core/mock-api",
  "specs": ["../api-specs/orders.yaml", "../api-specs/customers.yaml"],
  "mode": "mock",
  "delay": 300
}
```

If you change `out`, import the interceptor from that folder in `app.config.ts`. With
the [team setup](#commit-the-registration-for-the-whole-team), run with `--stub` once
more to get the updated alias.

If your project has more than one `.openapi-generator` folder, the tool lists them and asks
you to pick one with `--generator-dir`.

## Troubleshooting

- **`ng-openapi-mock` is not recognized / command not found**: the `bin` folder isn't on
  your `PATH` yet, or the terminal was opened before you changed it. Check the
  [PATH setup](#optional-run-it-as-ng-openapi-mock) and reopen the terminal.
- **"TypeScript was not found"**: run `npm install` in the Angular project first.
- **"Cannot find module '@mock-api'"**: the alias from the
  [team setup](#commit-the-registration-for-the-whole-team) is missing or in the wrong
  tsconfig. Run `ng-openapi-mock --stub`: it says where the line belongs. If
  `tsconfig.app.json` has its own `"paths"`, the alias has to go there. Restart `ng serve`
  after changing a tsconfig.
- **Mocks don't kick in, or the app still mocks after deleting the mocks**: with the team
  setup, restart `ng serve` after generating the mocks for the first time or deleting the
  `mock-api` folder.
- **"js-yaml was not found"**: same as above. If the project really doesn't have it, use
  JSON exports of the specs instead.
- **"matched none of the app's API calls"**: that spec describes a different API than the
  generated client, or its paths differ and it has no matching `operationId`s.
- **"Listed in FILES but not found"**: the paths in `FILES` aren't relative to `src/app`.
  Set `--base-dir` to the right folder. If they're relative to the folder that contains
  `.openapi-generator`, they're found automatically.
- **`Cannot find module 'C:Users...'` in Git Bash**: the path was pasted with backslashes
  and without quotes. Use forward slashes or quotes. See the note under
  [Generate the mocks](#generate-the-mocks).
- **API calls still reach the real backend**: that's the default. In pass-through mode,
  only calls listed in `mock-api.overrides.ts` are mocked. To mock everything, generate
  with `--mode mock`. If listed calls aren't mocked either, check that the interceptor is
  registered in `app.config.ts` and that the app runs in development mode (`ng serve`,
  not a production build).
- **Every call is mocked and logged, but you only want the listed ones**: the files were
  generated in mock mode, by `--mode mock`, `"mode": "mock"` in the config file, or a
  version of this tool from before pass-through became the default. The generator's last
  line and the first `[mock]` line in the browser console both say which mode is active.
  Run the generator again without `--mode mock`.
- **A `mock-server/` folder from an older version**: it isn't used any more. Delete it.

## Developing this tool

```bash
npm install
npm test
```
