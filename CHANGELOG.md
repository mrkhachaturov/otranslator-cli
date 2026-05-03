# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-03

### Added

- Initial release of the unofficial OTranslator SDK and CLI.
- `OTranslatorClient` class with one method per documented endpoint, covering all 15
  v1 endpoints: `createTask`, `queryTask`, `deleteTask`, `restartTask`, `queryTexts`,
  `updateTexts`, `translateTexts`, `createGlossary`, `queryGlossary`, `updateGlossary`,
  `deleteGlossary`, `filetypes`, `languages`, `models`, `me`.
- TypeScript types for every request and response, hand-written and verified
  against the live API on 2026-05-03.
- `otcli` CLI binary (commander v14) shipped from the `otranslator-cli` npm
  package, with one command per SDK method plus `examples` — a guided tour
  that fetches the live model list and groups it by family with per-tier
  annotations.
- `login`, `logout`, and `whoami` commands. `login` prompts for a key (echo
  hidden on TTY, line-read on pipe), verifies it against `/v1/me`, and stores
  it at `~/.config/otranslator-cli/config.json` with mode 0600. Resolution at
  runtime is `--api-key` flag → `OTRANSLATOR_API_KEY` env → stored config.
- Per-command `--help` examples on `create`, `start`, `translate`, `revise`,
  `glossary-create`, and the program root.
- `OTranslatorError` with discriminated `code` (`MISSING_API_KEY`, `INVALID_INPUT`,
  `NETWORK_ERROR`, `TIMEOUT`, `HTTP_ERROR`, `INVALID_RESPONSE`).
- Glossary `keys` and `translated` are encoded on send and parsed on receive,
  so consumers always work with native arrays and objects.
- `openapi.json` — OpenAPI 3.1 spec for the API, verified against live responses.
- Unit tests with mocked fetch (`npm test`).
- E2E suite that hits the real API (`npm run test:e2e` and
  `npm run test:e2e:paid`), auto-skipping when `OTRANSLATOR_API_KEY` is unset.
- `scripts/verify-models.ts` — one-shot probe that runs one model per tier and
  reports credit deltas.
- ESLint v9 flat config + Prettier + Husky pre-commit + lint-staged.
- `tsup` build pipeline producing dual ESM/CJS output and `.d.ts` declarations.
- GitHub Actions workflows for CI and tag-triggered npm publish.
