---
slug: rotacion-bot
status: approved
owner: Kevin Real
created: 2026-09-15
approved_by: Kevin Real (plan approval, 2026-09-15)
---

# PRD — Discord rotation bot

## Mission

A game group caps at 5 players per match. When more than 5 people sign up, someone has to sit
out, and today that is decided by hand — which means the same people keep sitting out. This bot
runs the sign-up through message reactions, draws the excess players at random, and remembers
who was left out so that they are guaranteed a seat in the following round.

**Done when:** `/rotacion` run with 7 reacting accounts produces a result listing exactly 5
players and 2 nominees, and a second round with the same 7 accounts nominates neither of the
2 previous nominees.

---

## In Scope

- [ ] `/rotacion [duracion] [nota]` posts a sign-up embed with a "Cerrar convocatoria" button
- [ ] Sign-up by reaction: any emoji counts, each user counted exactly once
- [ ] Pool closes on timer or button press, whichever happens first
- [ ] Draw: 5 or fewer participants means everybody plays; more than 5 means the excess are
      drawn at random among the non-immune participants
- [ ] Immunity: the users benched in the previous round of that channel cannot be nominated
- [ ] If the immune players outnumber the 5 seats, 5 are drawn among them and the leftovers
      stay benched and keep their immunity
- [ ] Rotation memory per channel, persisted to `data/state.json` and reloaded at boot
- [ ] Slash-command registration script
- [ ] Unit tests for the draw logic
- [ ] Explanatory comments at the key points (explicitly requested; overrides the global
      no-comments rule for this repo only)

---

## Out of Scope

- More than one open pool per channel at a time (a second `/rotacion` is rejected)
- Forming several groups of 5 when 10+ people sign up; always one group of 5
- `/rotacion-reset`, `/rotacion-estado`, history, stats, benched-streak tracking, MVP, ELO
- A database, Docker, CI, deployment pipeline
- Waitlist or substitute-if-someone-drops logic
- Any dependency beyond discord.js, typescript, @types/node and vitest

**Rule:** if something here turns out to be genuinely required, stop and ask.

---

## Architecture

**Approach:** One process, no database. The draw rule lives in a pure function with no
discord.js import so it can be tested without a gateway connection; discord.js code only
gathers participants and renders the result. Rotation memory is a `Map` mirrored to a JSON
file on every close. The rejected alternative was SQLite, which buys durability guarantees
this group does not need and adds a native dependency.

**Touches:**

| Path | Change |
|------|--------|
| `src/domain/rotation.ts` | Pure draw logic: `shuffle`, `resolveRound`, `GROUP_SIZE` |
| `src/state/store.ts` | Rotation memory, JSON persistence |
| `src/pools.ts` | In-flight sign-up registry, never persisted |
| `src/commands/rotacion.ts` | Command, reaction collector, close flow |
| `src/index.ts` | Client, intents, partials, interaction routing |
| `src/deploy-commands.ts` | Slash-command registration |

**Data model:** `data/state.json` — `{ channels: { <channelId>: { benched: string[], lastRoundAt: string } } }`.
Written atomically (temp file + rename). A corrupt or missing file starts from empty state.

**Contracts:** none — no external consumers.

**Dependencies:** `discord.js` (prod); `typescript`, `@types/node`, `vitest` (dev).

**Risk & rollback:** a restart loses an open sign-up but not the immunity list; a corrupt
state file degrades to "no immunity" rather than crashing. Rollback is deleting the branch.

---

## Verification

| # | Check | How | Result |
|---|-------|-----|--------|
| 1 | Types are sound | `pnpm typecheck` | PASS (2026-09-15) |
| 2 | Draw rules hold | `pnpm test` | PASS, 9/9 (2026-09-15) |
| 3 | Command registers | `pnpm commands`, then look for `/rotacion` in the guild | |
| 4 | Any emoji, unique users | React 3 times from one account, counter shows 1 | |
| 5 | Timer and button both close, once | Press Close before the timer fires | |
| 6 | Rotation rotates | Two rounds with 7 accounts, nominee sets are disjoint | |

---

## Log

- `2026-09-15` — Immune overflow resolved as: draw among the immune, leftovers keep immunity.
- `2026-09-15` — Memory persisted to JSON rather than in-memory only, to survive restarts.
- `2026-09-15` — Close button usable by anyone in the channel, not just the host.
- `2026-09-15` — Sample env file tracked as `env.example` (no leading dot): the global git
  hook refuses to stage anything matching `.env*`.
- `2026-09-15` — Checks 3 to 6 not run: they need a bot token and a test guild.
