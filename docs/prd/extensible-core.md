---
slug: extensible-core
status: done
owner: Kevin Real
created: 2026-09-15
approved_by: Kevin Real (plan approval, 2026-09-15)
---

# PRD — An extensible core

## Mission

The bot does one thing and its structure said so: the command name was a single string on the
dependency bag, the `/rotacion` JSON lived in a different file from the handler that read its
options, the store was hard-typed to `RotationDoc`, and `types.ts` held Discord protocol and
rotation domain side by side. Adding a second feature meant editing `server.ts`, `index.ts` and
`deploy-commands.ts` before writing a line of the feature. It also carried a latent bug that
would only fire once a second button existed.

**Done when:** adding a command is a new folder under `src/features/` plus one line in the
feature list, with no edit to `server.ts`, `index.ts` or `deploy-commands.ts` — proved by a
test that registers a second feature and asserts it routes.

---

## In Scope

- [x] Fix the unknown-`custom_id` fallthrough that silently removed the clicker
- [x] A command and component registry, with clashes throwing at construction
- [x] Command definitions co-located with the handlers that read their options
- [x] A generic `createDocumentStore<T>` so a second feature gets its own collection free
- [x] Discord protocol types separated from feature domain types
- [x] The rotation feature gathered into `src/features/rotation/`
- [x] `deploy-commands.ts` registering whatever the features declare
- [x] Documentation of the layout and of how to add a feature

---

## Out of Scope

Named so they did not creep in, and still open:

- **Generic task routing.** `/close` keeps its own route in `server.ts`, delegating to a
  function the rotation feature exports. Worth generalising when a second delayed action
  exists.
- **Per-guild configuration** — `GROUP_SIZE`, default duration, who may close. The most likely
  next request, and the reason this layout exists, but it is a feature with a data model.
- **A strings module.** Spanish text stays where it is.
- **Splitting `Deps` into per-feature bags at the composition root.** The feature already
  declares `RotationDeps`; `AppDeps` becomes an intersection the day a second feature lands.

**Rule:** if something here turns out to be genuinely required, stop and ask.

---

## Architecture

**Approach:** a thin core that routes, and features that declare what they answer to. The
registry is generic over the dependency bag, so `core/` depends on nothing below it. Features
declare their own dependency type, and the application's bag is the intersection — which means
a handler written today keeps compiling when a second feature adds its own needs.

Component routing is by `custom_id` **prefix**, so a feature owns a namespace instead of being
enumerated in a central switch. The alternative considered and rejected was a central map of
exact ids, which puts every feature back in one file.

**Touches:**

| Path | Change |
|------|--------|
| `src/core/registry.ts` | New: command and component routing, clash detection |
| `src/core/store.ts` | New: `createDocumentStore<T>`, extracted from the rotation store |
| `src/core/http.ts`, `src/core/memory.ts` | Moved out of the feature and the server |
| `src/discord/types.ts`, `interaction.ts` | Protocol types and payload helpers, feature-free |
| `src/features/rotation/*` | The whole feature, gathered from `domain/`, `handlers/`, `state/` |
| `src/server.ts` | Dispatches through the registry; no feature knowledge except `/close` |
| `src/deploy-commands.ts` | Registers `registry.definitions()` |

**Data model:** unchanged. Same `rotations/{channelId}` documents, same fields, same
`custom_id` strings — changing those would orphan the buttons on every open convocatoria.

**Contracts:** the command JSON registered with Discord was diffed against the previous
version and is byte-identical after key sorting.

**Dependencies:** none added. Still zero at runtime.

**Risk & rollback:** the suite was the safety net — 70 tests, of which the 56 that predate this
change needed only import edits. Rollback is deleting the branch.

---

## Verification

| # | Check | How | Result |
|---|-------|-----|--------|
| 1 | Behaviour unchanged | Existing tests pass with only import paths edited | PASS |
| 2 | The bug is gone | New test; also verified it fails when the fix is reverted | PASS |
| 3 | The registry is safe | Duplicate command, overlapping prefix, empty prefix all throw | PASS |
| 4 | The goal is met | A fake second feature routes its command and its button, no server edit | PASS |
| 5 | Registration unchanged | Diffed the generated JSON against the previous literal | PASS — identical |
| 6 | Types and boot | `pnpm typecheck`; server answers `/healthz`, `401`, `404` | PASS |

---

## Log

- `2026-09-15` — Found the `custom_id` fallthrough while surveying for extensibility; fixed
  first, on its own commit, with a test proved to fail without it.
- `2026-09-15` — Chose prefix-based component routing over a central id map.
- `2026-09-15` — Features declare their own deps type; `AppDeps` is the intersection.
- `2026-09-15` — Left `/close` feature-specific on purpose: one instance is not a pattern.
