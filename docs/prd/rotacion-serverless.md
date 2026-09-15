---
slug: rotacion-serverless
status: approved
owner: Kevin Real
created: 2026-09-15
approved_by: Kevin Real (plan approval, 2026-09-15)
---

# PRD — Rotation bot as HTTP interactions on Cloud Run

## Mission

The gateway version of the bot works but cannot be hosted for free: a persistent WebSocket
needs an always-on VM, and a VM needs a public IPv4, which GCP bills at $0.005/h — $3.65 a
month. Moving to Discord's HTTP interactions removes the persistent connection entirely, so
the bot can live in Cloud Run's free tier and scale to zero between convocatorias. The cost of
that move is that reactions are gateway-only events, so signing up becomes a button.

**Done when:** `/rotacion` opens a convocatoria with buttons, seven people join by clicking,
closing it seats five and nominates two, a second round nominates neither of those two, and a
full month of this costs $0.00.

---

## In Scope

- [ ] `POST /interactions` on Cloud Run, verifying every request with Ed25519
- [ ] PING/PONG handshake so Discord accepts the endpoint URL
- [ ] `/rotacion [duracion] [nota]` posts the convocatoria and schedules its auto-close
- [ ] Buttons: **Apuntarme**, **Salir**, **Cerrar convocatoria** (anyone in the channel)
- [ ] Draw rules unchanged: 5 or fewer play; above that the excess are drawn at random among
      the non-immune; immune players cannot be nominated; immune overflow draws among the
      immune and leftovers keep immunity
- [ ] Rotation memory per channel in Firestore, replacing `data/state.json`
- [ ] Auto-close by Cloud Tasks at `closesAt`, authenticated by a single-use per-pool secret
- [ ] `Dockerfile`, provisioning and deploy scripts pinned to the free-tier regions
- [ ] GitHub Actions deploy on push to `main`
- [ ] Integration test driving the real server with real signatures and in-memory fakes

---

## Out of Scope

- Reactions of any kind — technically impossible once the endpoint URL is set
- Several groups of 5 when 10+ sign up; still one group of 5
- Waitlists, substitutes, stats, history, benched-streak tracking, MVP, ELO
- A web dashboard or any UI outside Discord
- Migrating the gateway bot's `data/state.json` into Firestore — there is no production data
- Any runtime dependency. The service ships with zero.
- Keeping the gateway bot working in parallel; it stays on its branch, unmaintained

**Rule:** if something here turns out to be genuinely required, stop and ask.

---

## Architecture

**Approach:** Cloud Run holds no state and no connection; Discord POSTs interactions to it and
it answers within the 3-second deadline. State lives in one Firestore document per channel,
and the delayed close is a Cloud Tasks task rather than a timer, because a scaled-to-zero
service has no timers. The rejected alternative was App Engine Standard, which is free but
does not support background processes, and App Engine Flexible, which supports them but has no
free tier.

Every handler completes all of its work *before* responding, because Cloud Run only guarantees
CPU during request processing.

**Touches:**

| Path | Change |
|------|--------|
| `src/domain/rotation.ts` | **Unchanged** — the draw rules and their tests carry over intact |
| `src/domain/pool.ts` | New: pure join/leave/isOpen |
| `src/discord/*` | New: Ed25519 verification, REST client, message rendering, type codes |
| `src/gcp/*` | New: metadata auth, Firestore REST, Cloud Tasks |
| `src/state/rotations.ts` | New: the rotation document, read-modify-write with retry |
| `src/handlers/*`, `src/server.ts` | New: routing and the interaction handlers |
| `src/commands/rotacion.ts`, `src/pools.ts`, `src/state/store.ts` | Deleted with the gateway model |

**Data model:** Firestore `rotations/{channelId}` — `immune: string[]`, `lastRoundAt: string`,
`pool: null | { messageId, hostId, note, closesAt, participants[], closeSecret }`. Optimistic
concurrency via `currentDocument.updateTime` preconditions with a bounded retry. No migration:
no existing data.

**Contracts:** the Discord interaction payload (external, fixed) and `POST /close`, which is
internal and authenticated by `closeSecret`.

**Dependencies:** none added; `discord.js` is **removed**. Node 24's WebCrypto covers Ed25519,
verified by running it.

**Risk & rollback:** the live risk is cold start against the 3-second deadline, which is why
the service carries no dependencies. Rollback is deleting the Cloud Run service; the gateway
bot remains on `feat/rotacion-bot`.

---

## Verification

| # | Check | How | Result |
|---|-------|-----|--------|
| 1 | Draw rules still hold | `pnpm test` | |
| 2 | Signatures verified correctly | Ed25519 unit tests: good accepted, tampered rejected | |
| 3 | Full flow works | Integration test: PING, `/rotacion`, 7 joins, close, second round rotates | |
| 4 | Types and scripts valid | `pnpm typecheck`, `bash -n deploy/*.sh` | |
| 5 | Image builds and boots | `docker build`, `GET /healthz` | |
| 6 | Cold start under 3 s | Time the first PING after scaling to zero | |
| 7 | Discord accepts the endpoint | Developer Portal turns green | |
| 8 | Bill is zero | Billing report + $1 budget alert | |

---

## Log

- `2026-09-15` — Chose HTTP interactions over paying $3.65/month for an e2-micro's IPv4.
- `2026-09-15` — Reactions dropped for buttons; forced by Discord, not a preference.
- `2026-09-15` — App Engine Standard rejected: no background process support.
- `2026-09-15` — Cloud Run free tier is US-only; `us-east1` chosen as closest to Spain.
- `2026-09-15` — `discord.js` removed entirely; zero runtime dependencies to protect cold start.
