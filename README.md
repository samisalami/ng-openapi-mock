# ng-openapi-mock

Generates mock data for an Angular project whose API client was created with
[openapi-generator](https://openapi-generator.tech) (`typescript-angular`). You get:

- **a mock server**: a small Node server you start next to `ng serve`
- **an Angular interceptor**: answers API calls inside the app, with no extra process

**Pick one, you don't need both.** Each works on its own and serves the same generated
data. By default both get generated so you can choose. Use `--targets server` or
`--targets interceptor` to generate only the one you use.

| | Mock server | Interceptor |
| --- | --- | --- |
| Runs | as a separate process next to `ng serve` | inside the Angular app |
| Changes to the app | none (proxy or base path only) | register it in `app.config.ts` |
| Edit responses | live, no restart | generate again |
| Visible in the browser's network tab | yes | no |

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

That's all you need in most projects. The tool finds the `.openapi-generator` folder,
reads the generated services and models, and writes:

| Folder | What's inside | Only with |
| --- | --- | --- |
| `mock-server/` | `server.mjs`, `routes.json`, `responses/` | `--targets server` |
| `mock-server/overrides/` | your [custom responses](#custom-responses) | always (used by both) |
| `src/app/mock-api/` | `mock-api.interceptor.ts`, `mock-api.data.ts` | `--targets interceptor` |

To generate just one of them:

```bash
node C:/tools/ng-openapi-mock/bin/ng-openapi-mock.mjs --targets server
node C:/tools/ng-openapi-mock/bin/ng-openapi-mock.mjs --targets interceptor
```

Then follow either [Use the mock server](#use-the-mock-server) or
[Use the Angular interceptor](#use-the-angular-interceptor). If you set up both at the
same time, the interceptor answers first and the server never sees those requests.

Run the command again whenever the API client is regenerated.

## Use the mock server

Start it in a second terminal:

```bash
node mock-server/server.mjs
```

It runs on http://localhost:3000 and logs every request. Change the port with
`--port 4000` and add a response delay with `--delay 500` (in milliseconds).

To point your Angular app at it, either:

- **Use a proxy** (recommended): generate with `--prefix api` if your API calls go to
  `/api/...`, then start Angular with

  ```bash
  ng serve --proxy-config mock-server/proxy.conf.json
  ```

- **or set the base path** of the generated API client to `http://localhost:3000`.
  The server allows cross-origin requests.

Routes match by their end, so `/api/v1/pet/5`, `/pet/5` and
`https://anything/pet/5` all reach the `/pet/{petId}` mock.

## Use the Angular interceptor

Register it in `app.config.ts`:

```ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { mockApiInterceptor } from './mock-api/mock-api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withInterceptors([mockApiInterceptor])),
  ],
};
```

Mocked API calls get an answer right away, and every other request (assets, translations,
endpoints without a mock) goes through as normal. Only enable it for local development,
for example behind a flag in your environment file.

## Custom responses

Custom responses work with **both** the mock server and the interceptor. The folder is
always `mock-server/overrides/`, even if you only use the interceptor (or the folder you
set with `--out`, plus `/overrides`).

To replace a generated response, put a JSON file into that folder. Name it after the
service class and method of the generated client:

```
mock-server/overrides/PetService/getPetById.json
```

The tool never touches the overrides folder. When you apply your changes depends on
which one you use:

| | Mock server | Interceptor |
| --- | --- | --- |
| After you change an override | it's used on the next request, no restart needed | run the generator again |

Endpoints that return nothing respond with `204 No Content`. An override for one of them
is sent as `200` with your JSON.

## Options

You can pass options on the command line or put them in `ng-openapi-mock.config.json`
in the project root (command line wins).

| Option | Config key | Default | Description |
| --- | --- | --- | --- |
| `--project <dir>` | – | current folder | Angular project root |
| `--generator-dir <dir>` | `generatorDir` | found automatically | The `.openapi-generator` folder |
| `--base-dir <dir>` | `baseDir` | `src/app` | Folder the paths in `FILES` are relative to |
| `--targets <list>` | `targets` | `server,interceptor` | What to generate: `server`, `interceptor` or both |
| `--out <dir>` | `out` | `mock-server` | Mock server folder |
| `--interceptor-out <dir>` | `interceptorOut` | `src/app/mock-api` | Interceptor folder |
| `--port <n>` | `port` | `3000` | Default port of the mock server |
| `--prefix <path>` | `prefix` | – | API path prefix, writes `mock-server/proxy.conf.json` |
| `--delay <ms>` | `delay` | `0` | Response delay for server and interceptor |
| `--array-length <n>` | `arrayLength` | `3` | Number of items in generated lists |
| `--max-depth <n>` | `maxDepth` | `4` | How deep nested objects are filled |
| `--config <file>` | – | `ng-openapi-mock.config.json` | Use a different config file |

Paths are relative to the project root. Example config file:

```json
{
  "generatorDir": "src/app/core/api/generated/.openapi-generator",
  "baseDir": "src/app",
  "prefix": "api",
  "port": 3000
}
```

If your project has more than one `.openapi-generator` folder, the tool lists them and asks
you to pick one with `--generator-dir`.

## Troubleshooting

- **"TypeScript was not found"**: run `npm install` in the Angular project first.
- **"Listed in FILES but not found"**: the paths in `FILES` aren't relative to `src/app`.
  Set `--base-dir` to the right folder. If they're relative to the folder that contains
  `.openapi-generator`, they're found automatically.
- **`--prefix /api` turns into `C:/Program Files/Git/api` in Git Bash**: Git Bash rewrites
  arguments that start with `/`. Write `--prefix api` instead. Both forms work in PowerShell.
- **Port already in use**: `node mock-server/server.mjs --port 3001`.

## Developing this tool

```bash
npm install
npm test
```
