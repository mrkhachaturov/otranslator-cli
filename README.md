# otranslator-cli

[![npm version](https://img.shields.io/npm/v/otranslator-cli?logo=npm&label=npm)](https://www.npmjs.com/package/otranslator-cli)
[![Downloads](https://img.shields.io/npm/dm/otranslator-cli?logo=npm&color=blue)](https://www.npmjs.com/package/otranslator-cli)
[![CI](https://github.com/mrkhachaturov/otranslator-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/mrkhachaturov/otranslator-cli/actions/workflows/ci.yml)
[![Node](https://img.shields.io/node/v/otranslator-cli?logo=nodedotjs)](https://nodejs.org)
[![License: MIT](https://img.shields.io/npm/l/otranslator-cli?color=success)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](./tsconfig.json)

Unofficial Node.js SDK and CLI for the [OTranslator](https://otranslator.com) API. Document, subtitle, audio, and plain text translation across 100+ languages with the original layout preserved.

> Not affiliated with OTranslator. Reverse-engineered from the public developer docs at https://otranslator.com/en/developer and verified against the live API. Every endpoint, request shape, and response shape documented here was exercised by the e2e suite under `test/e2e/` on 2026-05-03.

## First run

```bash
npm install -g otranslator-cli   # adds `otcli` to your $PATH
otcli login                      # interactive prompt, validates against /v1/me
otcli whoami                     # → { "source": "config", "balance": <credits> }
otcli translate "Hello, world." --from English --to Spanish
```

Prefer not to install globally? `npx otranslator-cli <command>` works the same.

## Install

```bash
npm install otranslator-cli      # as a dependency in your project
# or
npm install -g otranslator-cli   # as a system-wide CLI
```

The npm package is `otranslator-cli`. It installs a single CLI binary on your `$PATH` called `otcli`. All examples in this README use `otcli`.

Node 20+ required. The SDK uses built-in `fetch`, `FormData`, and `File`, so it also works in browsers without polyfills.

## How translation works

OTranslator follows a preview-then-pay model. You upload a document, the API generates a free preview of roughly the first 2,000 words, and only when you're happy with the preview do you pay credits to translate the rest.

The full flow:

1. `createTask` uploads the file. Set `preview: true` for a sample, or `preview: false` to translate everything immediately (deducts credits up front).
2. `queryTask` returns status, progress, and — once `Completed` — `translatedFileUrl` plus a `price` field showing what a full translation would cost.
3. `restartTask` with `payWithCredits: true` and a `model` from one of the paid tiers converts the preview into a full translation.

Free preview credits replenish whenever you complete a paid full translation, so the cost model rewards finishing what you start.

### Model tiers

The product UI groups the eleven models from `/v1/models` into three tiers. Pricing applies to **document full translation** (the `restartTask` step). Synchronous `translateTexts` costs 2 credits regardless of tier — at least on the short strings we measured.

- **Basic**: `gpt-5-mini`, `claude-4.5-haiku`, `gemini-3.1-flash`, `deepseek-3.2`
- **Advanced**: `gpt-5.4`, `claude-4.6-sonnet`, `gemini-3.1-pro`, `deepseek-3.2-thinking`
- **Inference / Thinking**: `gpt-5.4-thinking`, `claude-4.6-sonnet-thinking`, `gemini-3.1-thinking`

The API takes a raw model id — the SDK doesn't gate which tier you can use. Run `node --env-file=.env --import tsx scripts/verify-models.ts` to probe one model per tier and see live credit costs.

## Authentication

Three ways to provide your key, resolved in this order:

1. `--api-key <key>` flag on any command
2. `OTRANSLATOR_API_KEY` environment variable
3. The stored config file written by `otcli login` at `~/.config/otranslator-cli/config.json` (mode 0600)

The interactive flow mirrors `gh`, `stripe`, `vercel`, and friends:

```bash
otcli login         # prompts for the key, hides echo, validates against /v1/me, persists on success
otcli whoami        # shows which source the active key comes from + current balance
otcli logout        # deletes the stored config file
```

`whoami` is also handy when handing the CLI to another agent — it confirms the key is wired up before any real work starts.

## CLI quick start

```bash
otcli login                  # one-time setup; or `export OTRANSLATOR_API_KEY=sk-…`

# Discover the surface
otcli filetypes
otcli languages
otcli models
otcli me                     # → { "balance": 421 }

# Synchronous text translation
otcli translate "Hello, world." --from English --to Spanish

# Document workflow
otcli create -f contract.pdf --from English --to French --preview
otcli task <taskId>                              # poll until status: Completed
otcli start <taskId> --pay-with-credits --model gpt-5.4
```

Every command prints JSON to stdout and exits non-zero on failure with the API's error body on stderr. Pipe into `jq` to filter, or chain commands together.

## SDK quick start

```ts
import { OTranslatorClient } from 'otranslator-cli';
import { readFile } from 'node:fs/promises';

const client = new OTranslatorClient({
  apiKey: process.env.OTRANSLATOR_API_KEY!,
});

// Upload, get a preview, wait for completion
const buffer = await readFile('contract.pdf');
const file = new File([buffer], 'contract.pdf');

const { taskId } = await client.createTask({
  file,
  fromLang: 'English',
  toLang: 'French',
  preview: true,
});

// Poll until terminal
let task = await client.queryTask(taskId);
while (task.status === 'Waiting' || task.status === 'Processing') {
  await new Promise((r) => setTimeout(r, 5_000));
  task = await client.queryTask(taskId);
}

console.log(task.status, task.translatedFileUrl, `costs ${task.price} credits to convert`);

// Convert preview → full translation
if (task.status === 'Completed' && task.price !== undefined) {
  await client.restartTask({ taskId, payWithCredits: true, model: 'gpt-5.4' });
}
```

## What's covered

15 endpoints, one method each. Every row below was exercised against the live API.

| SDK method       | HTTP                                  | Notes                                                                                        |
| ---------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `createTask`     | `POST /v1/translation/create`         | `multipart/form-data`. Returns `{ taskId }`.                                                 |
| `queryTask`      | `POST /v1/translation/query`          | Returns the full task object — status, progress, file URLs, credit costs, model used.        |
| `deleteTask`     | `POST /v1/translation/delete`         | Returns `{ success: true }`.                                                                 |
| `restartTask`    | `POST /v1/translation/start`          | `{ taskId, payWithCredits?, model? }` → `{ success: true }`.                                 |
| `queryTexts`     | `POST /v1/translation/queryTexts`     | Returns `{ texts: { [src]: tgt }, revisedTexts: { [src]: tgt } }`. Source string is the key. |
| `updateTexts`    | `POST /v1/translation/updateTexts`    | Submit a `{ [sourceSegment]: revisedTranslation }` map. Returns `{ success: true }`.         |
| `translateTexts` | `POST /v1/translation/translateTexts` | Synchronous. Returns `{ translatedTexts, price, usedCredits }`.                              |
| `createGlossary` | `POST /v1/glossary/create`            | Returns `{ glossaryId }`.                                                                    |
| `queryGlossary`  | `POST /v1/glossary/query`             | SDK parses `keys` and `translated` from JSON-encoded strings to native types.                |
| `updateGlossary` | `POST /v1/glossary/update`            | Same parsing as `queryGlossary`.                                                             |
| `deleteGlossary` | `POST /v1/glossary/delete`            | Returns `{ success: true }`.                                                                 |
| `filetypes`      | `POST /v1/filetypes`                  | 60+ formats: pdf, docx, epub, srt, mp3, cbz, etc.                                            |
| `languages`      | `POST /v1/languages`                  | 80+ languages including `Any Language` as a wildcard.                                        |
| `models`         | `POST /v1/models`                     | Returns 11 model ids (see Model tiers above).                                                |
| `me`             | `POST /v1/me`                         | Returns `{ balance: number }` — credit balance and nothing else.                             |

For full request and response shapes, look at the generated TypeScript types in `dist/index.d.ts` or open [`openapi.json`](./openapi.json).

## Behavioural notes from real responses

A few things worth flagging because the official docs don't mention them:

- **Auth.** The `Authorization` header takes the raw secret key. No `Bearer` prefix. This is the single most common stumbling block when porting from another translation API.
- **Preview is normally free.** Each account ships with a pool of free preview credits, and the pool refills every time you complete a paid full translation. The 2-credit cost the docs mention only kicks in after the pool runs out.
- **Glossary `keys` and `translated` are doubly encoded on the wire.** Both fields are sent as JSON-encoded strings inside the JSON request body, and they come back the same way. The SDK encodes on the way out and parses on the way in, so your code works with native arrays and objects.
- **`TranslationTask` returns more fields than documented.** `fileTitle`, `fileUrl`, `wordNums`, `forceOCR`, and an `errorMsg` that may be `null` are all present. The SDK types include them.
- **Default model.** When `createTask` omits `model`, the server picks `gpt-4.1-mini` for previews. That id is not in the `/v1/models` list, so don't hard-code your model lookups against it.
- **Status transitions.** The state machine we observed: `Waiting → Processing → Completed`. `Terminated` and `Cancelled` exist in the type but only show up on errors or explicit deletes.

## Configuration

| Env var                  | CLI flag     | Default                       |
| ------------------------ | ------------ | ----------------------------- |
| `OTRANSLATOR_API_KEY`    | `--api-key`  | (required)                    |
| `OTRANSLATOR_BASE_URL`   | `--base-url` | `https://otranslator.com/api` |
| `OTRANSLATOR_TIMEOUT_MS` | `--timeout`  | `60000`                       |

## Tests

Two suites.

`npm test` runs unit tests with a mocked fetch. Fast, no network, no key needed.

`npm run test:e2e` hits the real API. It loads `OTRANSLATOR_API_KEY` from `.env` via dotenv and auto-skips when the key is missing. The default e2e suite is free to run. It covers `languages`, `filetypes`, `models`, `me`, and the full glossary create-query-update-delete lifecycle.

The paid suite is opt-in:

```bash
npm run test:e2e:paid
```

That run exercises `translateTexts`, `createTask` in preview mode against `test/fixtures/sample.md`, `queryTask` polling, `queryTexts`, `updateTexts`, `restartTask` with `payWithCredits: true`, and `deleteTask` cleanup. With the bundled 351-byte fixture it costs around 2 credits per run because `price` for the doc itself is `0`. To test against a larger document, point at it:

```bash
OTRANSLATOR_E2E_FIXTURE="/path/to/your/document.md" npm run test:e2e:paid
```

The e2e tests also log every response we found undocumented (`/me`, `/models`, `/glossary/query`, `/translation/queryTexts`, etc.) so future API changes show up as test diffs.

## Errors

The SDK throws `OTranslatorError` for everything that isn't a 2xx with a JSON body. Inspect `code` to branch:

```ts
import { OTranslatorError } from 'otranslator-cli/errors';

try {
  await client.me();
} catch (err) {
  if (err instanceof OTranslatorError && err.code === 'HTTP_ERROR' && err.status === 401) {
    // bad API key — re-prompt the user
  }
  throw err;
}
```

`code` values: `MISSING_API_KEY`, `INVALID_INPUT`, `NETWORK_ERROR`, `TIMEOUT`, `HTTP_ERROR`, `INVALID_RESPONSE`.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build      # tsup → dist/ (ESM + CJS + .d.ts)
```

Run the CLI against the source directly without rebuilding:

```bash
npm run cli -- task <taskId>
```

## Releasing

The first publish is manual and **does not include provenance** — OIDC tokens can only be minted inside GitHub Actions, not on a laptop. Every subsequent release is published from CI on tag push, with provenance signed against the source commit.

```bash
# One-time first publish
npm login
npm publish --access public

# Then on https://www.npmjs.com/package/otranslator-cli →
#   Settings → Trusted Publishers → Add Publisher
#   - Repository: mrkhachaturov/otranslator-cli
#   - Workflow:   publish.yml
#   - Environment: (leave blank)

# Subsequent releases
# 1. Bump version in package.json
# 2. Add a new [X.Y.Z] - <date> heading in CHANGELOG.md (move items from
#    [Unreleased]). Keep a Changelog format.
# 3. Commit, tag, push
git commit -am 'release: v0.1.1'
git tag v0.1.1
git push --follow-tags
# Actions publishes to npm with provenance and creates a GitHub Release whose
# body is the matching CHANGELOG section.
```

### Verifying provenance

Once a release is published from CI, anyone can verify the build trail:

```bash
# Visual: https://www.npmjs.com/package/otranslator-cli shows a Provenance badge
# Programmatic:
npm view otranslator-cli --json | jq '.dist.attestations'
npm install otranslator-cli && npm audit signatures
```

Cryptographic verification independent of npm uses Sigstore's transparency log — see https://search.sigstore.dev for the public Rekor entries.

## License

MIT. See [LICENSE](./LICENSE).
