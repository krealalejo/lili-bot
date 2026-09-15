[← Back to the README](../README.md)

# Development

## Setup

```bash
pnpm install
```

That installs three dev dependencies — TypeScript, Vitest and `@types/node`. There are **no
runtime dependencies**; see [Architecture](architecture.md#why-zero-runtime-dependencies).

Node 24 or newer is required: the project runs TypeScript directly through type stripping, with
no build step.

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | The full suite, 70 tests |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm dev` | Runs the server with `--watch`, reading `.env` |
| `pnpm start` | Runs the server, reading the ambient environment (what the container does) |
| `pnpm commands` | Registers the `/rotacion` slash command with Discord |

## Tests

```bash
pnpm test
```

| File | Covers |
|---|---|
| `src/features/rotation/rotation.test.ts` | The draw: sizes, immunity, immune overflow, two-round turnover |
| `src/features/rotation/pool.test.ts` | Joining, leaving, duplicate clicks, expiry |
| `src/discord/verify.test.ts` | Ed25519: valid, tampered body, replayed timestamp, foreign key, malformed headers |
| `src/gcp/firestore.test.ts` | The typed-value codec round-trips, integers stay exact |
| `src/gcp/tasks.test.ts` | The Cloud Tasks payload shape and schedule time |
| `src/features/rotation/state.test.ts` | Optimistic concurrency, retry on contention, giving up |
| `src/core/registry.test.ts` | Routing, duplicate commands, overlapping prefixes |
| `src/core/store.test.ts` | The generic store against a non-rotation document shape |
| `src/server.test.ts` | The full flow end to end, plus routing a second feature |

`src/server.test.ts` is the one that matters most. It drives the **real** server with **real
Ed25519 signatures** from a generated keypair, an in-memory Firestore
(`src/core/memory.ts`) and a frozen clock — no network, no GCP, no Discord. It asserts
PING→PONG, rejected signatures, `/rotacion`, seven people joining, closing, the scheduled
callback, and that a second round nominates nobody who was nominated in the first.

That last assertion is the one worth keeping: it is the product rule the whole bot exists for.

### Writing new tests

Handlers take their collaborators as arguments (`src/features/rotation/deps.ts`), so a test constructs
`createApp({ store, tasks, discord, now, randomSecret, ... })` with fakes. Anything that reaches
the network belongs behind one of those interfaces.

Pure logic goes in `rotation.ts` and `pool.ts` inside the feature, and is tested without any of that.

## Running it locally

```bash
cp env.example .env   # fill in the variables
pnpm dev
```

Discord needs a **public** URL to call, so local work needs a tunnel:

```bash
cloudflared tunnel --url http://localhost:8080
```

Put the tunnel's URL in the Developer Portal as the Interactions Endpoint URL while you develop,
and remember to put the real one back afterwards.

Without GCP credentials the Firestore and Cloud Tasks calls will fail. For local work against
real Discord you can point `src/index.ts` at `createMemoryFirestore()` from `src/core/memory.ts`,
at the cost of losing state on every restart.

## Conventions

- **No comments in code** except where a decision is genuinely non-obvious — the rationale
  belongs in these docs, not scattered through the source
- Atomic commits, Conventional Commits format, each one green on its own
- Tests live in the same commit as the behaviour they cover
- Documentation in English; the bot's Discord-facing strings stay Spanish, because that is the
  audience

## Where to change what

| To change | Edit |
|---|---|
| The draw rules | `src/features/rotation/rotation.ts` |
| Group size | `GROUP_SIZE` in `src/features/rotation/rotation.ts` |
| What the messages say | `src/features/rotation/render.ts` |
| Default or maximum duration | `src/config.ts` |
| Command name or options | `src/features/rotation/command.ts`, then re-run `pnpm commands` |
| Button labels or ids | `src/features/rotation/ids.ts` and `src/features/rotation/render.ts` |

---

**Next:** [Architecture](architecture.md) · [Troubleshooting](troubleshooting.md)

## Adding a feature

See [Architecture → Adding a feature](architecture.md#adding-a-feature). The short version: a
new folder under `src/features/`, exporting a `Feature`, plus one line in
`src/features/index.ts`. Nothing in `server.ts`, `index.ts` or `deploy-commands.ts` changes.
