---
slug: miticas
status: done
owner: Kevin Real
created: 2026-11-03
approved_by: Kevin Real (plan approval, 2026-11-03)
---

# PRD — /miticas: a role-aware convocatoria

## Mission

`/rotacion` fills five interchangeable seats. Mythic+ groups are not interchangeable: a group
is exactly one tank, one healer and three DPS, and most players can only fill some of those.
`/miticas` keeps everything people already know from `/rotacion` — the sign-up message, the
timer, the close button, the draw and the memory of who sat out — but each person signs up
with the roles they can play, and the bot builds the one group that respects them.

**Done when:** in a channel, `/miticas` opens a sign-up, people toggle Tank / Healer / DPS,
and on close the bot posts a group of 1 tank + 1 healer + 3 DPS drawn from the sign-ups,
seating last round's benched players first whenever their roles allow it.

---

## In Scope

- [x] `/miticas` slash command with the same `duracion` and `nota` options as `/rotacion`
- [x] Sign-up message with toggle buttons **Tank**, **Healer**, **DPS**, plus **Salir** and
      **Cerrar convocatoria**; toggling a role on signs you up, toggling your last role off
      removes you; the message lists each person with their roles
- [x] One open `/miticas` convocatoria per channel, independent of `/rotacion`
- [x] On close (button or timer): one group of 1 tank, 1 healer, 3 DPS, with each seated
      player shown in the role they were given
- [x] Last round's benched players play, as in `/rotacion`. The only exception is when
      seating all of them would leave the group without a tank or healer that someone else
      could fill: then that tank or healer keeps their spot. The group is always filled as
      much as the roles allow first; within that, as many benched players as possible play,
      and only the remaining seats are drawn at random. If the benched alone outnumber the
      seats, the draw is among them and the leftovers keep their priority
- [x] Roles are reassigned to make room for the benched: if a benched tank and last
      round's tank both sign up, the benched one plays tank and the other moves to another
      role they ticked (e.g. DPS). Same rule for every role. A player is only ever placed in
      a role they ticked; if they ticked no other free role, they are the one benched
- [x] If the roles cannot complete the group (e.g. nobody can heal), the bot posts the
      partial group and names the missing roles
- [x] Everyone not seated is benched and has priority next `/miticas` round in that channel;
      an empty convocatoria leaves the priority list untouched; a round where everyone fits
      clears it
- [x] The Cloud Tasks auto-close is routed per feature, so both features can schedule closes
- [x] Tests for the role-aware draw, the role toggling, and the end-to-end flow through
      `createApp`
- [x] README and architecture docs updated

---

## Out of Scope

- **More than one group.** Overflow is benched, as in `/rotacion` (decided 2026-11-03).
- **A select menu** for roles. Toggle buttons only (decided 2026-11-03).
- **A guarantee that beats the composition.** A benched player never displaces the only
  person who can fill a role, and two benched tank-only players cannot both play.
  `/rotacion` keeps its unconditional guarantee, unchanged.
- **Role preferences or weighting** ("I'd rather DPS"), keystone levels, classes, specs.
- **Sharing memory** between `/rotacion` and `/miticas` — separate collections.
- **Per-guild configuration** of group size or composition.
- **Any change to `/rotacion` behaviour, text or `custom_id`s.**
- **New dependencies of any kind.** Infra changes (the queue and the `/close` URL stay as they are).

**Rule:** if something here turns out to be genuinely required, **stop and ask**.

---

## Architecture

**Approach:** a new feature folder `src/features/miticas/`, shaped exactly like `rotation/`,
with its own Firestore collection `miticas/{channelId}` and its own `custom_id` prefix `mit:`.
The draw is a priority-ordered greedy over bipartite matching of players to the five slots:
candidates are ordered benched-first (shuffled), then everyone else (shuffled), and each one
is seated if a valid assignment still exists with them added. Because the sets of players that
fit a role layout form a transversal matroid, this greedy gives the maximum possible group and,
within that, prefers the benched — no brute force. The rejected alternative was enumerating
every 5-player combination, which is simpler to read but grows badly past ~20 sign-ups.

The `/close` route stops being rotation-only, as the extensible-core PRD anticipated: a
feature declares named **jobs** in the registry, the Cloud Tasks payload carries `job`, and
`server.ts` dispatches through the registry. A payload with no `job` (a task queued before this
deploy) routes to the rotation job, so in-flight convocatorias still auto-close.

`shuffle` moves from `features/rotation/rotation.ts` to `src/core/random.ts` so the two
features do not import each other.

**Touches:**

| Path | Change |
|------|--------|
| `src/core/registry.ts`, `registry.test.ts` | `jobs` on `Feature`, `registry.job(name)`, clash check |
| `src/core/random.ts`, `random.test.ts` | New: `shuffle` and its test, moved from rotation |
| `src/gcp/tasks.ts`, `tasks.test.ts` | `CloseTaskPayload` gains `job` |
| `src/server.ts`, `server.test.ts` | `/close` dispatches by `job`, defaulting to rotation |
| `src/features/rotation/{command,close,index,rotation,rotation.test}.ts` | Send `job`, declare its job, import `shuffle` from core |
| `src/features/miticas/*` | New feature: `ids`, `state`, `pool`, `group`, `render`, `command`, `buttons`, `close`, `deps`, `index`, tests |
| `src/features/index.ts` | Register the feature |
| `src/features/gragussy/index.ts` | Declares `jobs: []` (the field is required) |
| `src/deps.ts`, `src/index.ts` | `AppDeps = RotationDeps & MiticasDeps`; wire `miticasStore` |
| `README.md`, `docs/architecture.md`, `docs/development.md` | Document the command and the job routing |

**Data model:** new collection `miticas/{channelId}`:
`{ priority: string[], lastRoundAt: string | null, pool: { messageId, hostId, note, closesAt,
participants: { id, roles: ('tank'|'healer'|'dps')[] }[], closeSecret } | null }`.
`rotations/*` is untouched.

**Contracts:** Cloud Tasks body becomes `{ job, channelId, closeSecret }`; the old shape is
still accepted. Rotation `custom_id`s and the `/rotacion` definition are unchanged.
`pnpm commands` must be run once after deploy to register `/miticas`.

**Dependencies:** none.

**Risk & rollback:** the risky part is the `/close` dispatch, since breaking it silently
stops auto-close for `/rotacion`; covered by the existing scheduled-close tests plus one for
a legacy payload with no `job`. Rollback is redeploying the previous revision; an orphaned
`/miticas` command can be removed by running `pnpm commands` from the old revision.

---

## Verification

| # | Check | How | Result |
|---|-------|-----|--------|
| 1 | Draw respects composition | `group.test.ts`: never more than 1 tank / 1 healer / 3 DPS, each in a role they picked | PASS |
| 2 | Draw is maximal and prefers the benched | `group.test.ts`: crafted cases + 200-run randomised checks | PASS — verified failing when the priority order is removed |
| 2b | Role swap for the benched | `group.test.ts`: benched tank-only + previous tank who also ticked DPS → benched plays tank, the other plays DPS | PASS |
| 2c | Benched always play unless irreplaceable role | `group.test.ts`: 200 runs, every benched player is seated whenever a full group containing them all exists; with 5 benched non-healers and one non-benched healer, the healer plays | PASS |
| 3 | Missing roles reported | `group.test.ts`: no healer → partial group, `missing: ['healer']` | PASS |
| 4 | Toggling works | `pool.test.ts`: add, toggle off, last role off removes, Salir | PASS |
| 5 | End to end | `server.test.ts`: `/miticas` → toggles → close button and scheduled close | PASS |
| 6 | Rotation unaffected | existing rotation and server tests pass; legacy `/close` payload test | PASS — all pre-existing tests green |
| 7 | Types | `pnpm typecheck` | PASS |

---

## Log

- `2026-11-03` — One group only, overflow benched; toggle buttons for roles (user decisions).
- `2026-11-03` — Priority instead of a guaranteed seat, forced by role constraints.
- `2026-11-03` — User rule: seated players move to another ticked role so a benched player
  can take theirs, for every role.
- `2026-11-03` — User rule: the benched play next round like `/rotacion`, except when that
  would leave the group without its only possible tank or healer.
- `2026-11-03` — Two commits: job routing in core (76 tests), then the feature (101 tests).
