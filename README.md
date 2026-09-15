# lilibot

A Discord bot that shares out the seats in a game group capped at **5 players per match**. It
opens a sign-up, people join with a button, and when it closes it draws at random who sits
out — remembering last round's leftovers so the same people don't always miss out.

Runs on Google Cloud Run for **$0/month**, inside the Always Free tier.

---

## Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Step 1 — Create the Discord application](#step-1--create-the-discord-application)
4. [Step 2 — The keys you need](#step-2--the-keys-you-need)
5. [Step 3 — Deploy to Google Cloud](#step-3--deploy-to-google-cloud)
6. [Step 4 — Connect Discord to the service](#step-4--connect-discord-to-the-service)
7. [Step 5 — Verify it works](#step-5--verify-it-works)
8. [Automatic deploys from GitHub](#automatic-deploys-from-github)
9. [Environment variables](#environment-variables)
10. [Cost](#cost)
11. [Local development](#local-development)
12. [Project layout](#project-layout)
13. [Troubleshooting](#troubleshooting)
14. [Uninstalling](#uninstalling)

---

## What it does

1. `/rotacion` posts a sign-up with the buttons **Apuntarme**, **Salir** and
   **Cerrar convocatoria**.
2. People click to join. Each person counts once, however many times they click.
3. It closes on a timer or on the button, whichever comes first. Anyone in the channel may
   close it.
4. The draw:
   - **5 or fewer** signed up → everybody plays, no rotation (and the memory is cleared).
   - **More than 5** → the excess are drawn at random. Anyone benched last round has a
     **guaranteed seat** and is not entered into the draw.
   - If more than 5 players are owed a seat, the 5 seats are drawn **among them**, and whoever
     misses out keeps immunity for the round after.
5. This round's nominees are next round's immune players. That single handover is the whole
   rotation.

Memory is **per channel**: every channel keeps its own rotation.

> The bot's Discord-facing text is in Spanish, matching the server it was built for. It lives
> in `src/discord/render.ts` if you want to change it.

### Command options

| Option | Default | Range |
|---|---|---|
| `duracion` | 120 s | 10 – 3600 s |
| `nota` | — | up to 200 characters |

```
/rotacion
/rotacion duracion:300
/rotacion duracion:60 nota:Ranked a las 22:00
```

---

## Architecture

```
Discord ──POST /interactions──► Cloud Run (scales to zero)
                                   │  verify Ed25519, then act
                                   ├──► Firestore    rotations/{channelId}
                                   ├──► Discord REST (bot token)
                                   └──► Cloud Tasks  schedule the close
Cloud Tasks ──POST /close (at closing time)──► Cloud Run
```

There is no gateway and no WebSocket: **Discord calls the bot, not the other way round**. That
is why no process needs to stay up all day, and also why joining is a button rather than a
reaction — reactions only exist on the gateway.

**Zero runtime dependencies.** No `discord.js`, no Google SDKs: Node 24 ships Ed25519 in
WebCrypto and `fetch`, and the Google APIs are spoken over REST using a token from the metadata
server. That keeps the image minimal and boot at **~85 ms**, which is what holds the bot inside
Discord's 3-second response deadline.

---

## Step 1 — Create the Discord application

1. Go to <https://discord.com/developers/applications> and click **New Application**.
2. Name it (`lilibot`, say) and accept the terms.
3. Open the **Bot** tab:
   - Click **Reset Token** and copy it. **It is shown only once.** This is `DISCORD_TOKEN`.
   - Turn off **Public Bot** unless you want others to be able to invite it.
   - **Leave every Privileged Gateway Intent off.** This bot has no gateway and never reads
     message content.
4. Open **General Information** and copy:
   - **Application ID** → `APPLICATION_ID`
   - **Public Key** → `DISCORD_PUBLIC_KEY`
5. Open **OAuth2 → URL Generator**:
   - Scopes: **`bot`** and **`applications.commands`**
   - Bot permissions: **View Channel**, **Send Messages**, **Embed Links**
   - Copy the generated URL, open it, and invite the bot to your server.

> The **Interactions Endpoint URL** is set later, in
> [Step 4](#step-4--connect-discord-to-the-service): the service has to exist first.

### Getting the server ID (optional but recommended)

With a server ID the `/rotacion` command appears instantly; without one it registers globally
and Discord takes up to an hour to propagate it.

1. Discord settings → **Advanced** → enable **Developer Mode**.
2. Right-click the server → **Copy Server ID** → `GUILD_ID`.

---

## Step 2 — The keys you need

| Key | Where to get it | Secret? | What it is for |
|---|---|---|---|
| `DISCORD_TOKEN` | Developer Portal → **Bot** → Reset Token | **Yes** | Posting and editing messages as the bot |
| `DISCORD_PUBLIC_KEY` | Developer Portal → **General Information** → Public Key | No, but critical | Verifying that each request really came from Discord |
| `APPLICATION_ID` | Developer Portal → **General Information** → Application ID | No | Registering the slash command |
| `GUILD_ID` | Right-click the server → Copy Server ID | No | Registering the command in your server only |

On the Google side you only need your **GCP project ID**; the scripts create everything else.

> **The token is never written into a file in this repository.** `provision.sh` reads it from
> stdin and stores it in Secret Manager; Cloud Run injects it as an environment variable at
> runtime. `.env` is gitignored.

---

## Step 3 — Deploy to Google Cloud

### Prerequisites

- A GCP project with **billing enabled** (the free tier requires it even though it charges
  nothing)
- [`gcloud`](https://cloud.google.com/sdk/docs/install) installed and authenticated:
  `gcloud auth login`

> ### ⚠️ The region matters
> Cloud Run's free tier exists **only** in `us-central1`, `us-east1` and `us-west1`. Deploying
> to `europe-west1` or anywhere else bills from the first second. The scripts refuse any region
> other than those three, and default to **`us-east1`**, the closest of them to Europe.

### 3.1 Provision the infrastructure

```bash
PROJECT_ID=your-project ./deploy/provision.sh
```

It creates, and tolerates already existing:

- The required APIs (Run, Firestore, Cloud Tasks, Secret Manager, Artifact Registry, Build)
- The **Firestore** database in native mode
- The `lilibot-run` service account
- The secrets `lilibot-discord-token` and `lilibot-discord-public-key` — **it will prompt you**:
  paste the value, press Enter, then Ctrl-D
- The Cloud Tasks queue `lilibot-close`
- An image cleanup policy (Artifact Registry's free tier is 0.5 GB)
- A **$1 budget alert** as a tripwire

Permissions the service account gets, and nothing more:

| Role | Scope |
|---|---|
| `roles/secretmanager.secretAccessor` | those two secrets only |
| `roles/datastore.user` | Firestore |
| `roles/cloudtasks.enqueuer` | creating the close task |

### 3.2 Deploy the service

```bash
PROJECT_ID=your-project APPLICATION_ID=123456789 ./deploy/deploy.sh
```

The first run deploys **twice**: `SERVICE_URL` has to exist as an environment variable, but
that URL does not exist until the service does. After that it is a single deploy each time.

When it finishes it prints the service URL. Keep it — the next step needs it.

The configuration it deploys with:

```
--min-instances=0      scales to zero: nothing is paid for sitting idle
--max-instances=2      safety cap against a surprise bill
--memory=256Mi --cpu=1
--concurrency=20
--cpu-boost            faster cold start
--allow-unauthenticated
```

> **Why `--allow-unauthenticated`?** Discord does not authenticate against your service, so IAM
> cannot be the gate. Security rests **entirely** on the Ed25519 verification of every request:
> without a valid signature the service returns `401` before it even looks at the payload. This
> is how every HTTP Discord bot works.

---

## Step 4 — Connect Discord to the service

1. Developer Portal → **General Information** → **Interactions Endpoint URL**:

   ```
   https://YOUR-SERVICE.run.app/interactions
   ```

2. Click **Save**. Discord sends a signed PING and the field must turn **green**. If it does
   not, stop here and see [Troubleshooting](#troubleshooting).

3. Register the slash command:

   ```bash
   cp env.example .env     # fill in DISCORD_TOKEN, APPLICATION_ID and GUILD_ID
   pnpm commands
   ```

4. Type `/rotacion` in your server.

---

## Step 5 — Verify it works

```bash
# The service responds
curl -s https://YOUR-SERVICE.run.app/healthz
# -> {"ok":true}

# An unsigned request must be rejected: this is the service's only gate
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{"type":1}' \
  https://YOUR-SERVICE.run.app/interactions
# -> 401

# Cold start: wait a few minutes for it to scale to zero, then measure
curl -s -o /dev/null -w 'cold start: %{time_total}s\n' https://YOUR-SERVICE.run.app/healthz

# Logs
gcloud run services logs read lilibot --region=us-east1 --limit=50
```

End-to-end check in Discord: run `/rotacion duracion:60`, have 7 people join, close it, and
confirm 5 are playing and 2 are nominated. Run it again — **neither of those 2 may be left out
a second time**.

---

## Automatic deploys from GitHub

`.github/workflows/deploy.yml` deploys on push to `main`. It uses **Workload Identity
Federation**, so no long-lived service-account key is ever stored in GitHub.

```bash
PROJECT_ID=your-project
REPO=krealalejo/lili-bot
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')

gcloud iam workload-identity-pools create github --location=global

gcloud iam workload-identity-pools providers create-oidc github-oidc \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'"

gcloud iam service-accounts create lilibot-deploy

for role in run.admin cloudbuild.builds.editor artifactregistry.writer \
            iam.serviceAccountUser storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:lilibot-deploy@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/${role}"
done

gcloud iam service-accounts add-iam-policy-binding \
  "lilibot-deploy@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/github/attributes/repository/${REPO}"
```

Then in GitHub → **Settings → Secrets and variables → Actions**:

| Kind | Name | Value |
|---|---|---|
| Secret | `WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-oidc` |
| Secret | `DEPLOY_SERVICE_ACCOUNT` | `lilibot-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | your project id |
| Variable | `DISCORD_APPLICATION_ID` | your application id |

The `attribute-condition` restricts access to **this** repository: another repo using the same
provider cannot deploy.

---

## Environment variables

Copy `env.example` to `.env` for local development. In production Cloud Run injects them: the
two secrets from Secret Manager, the rest as plain variables.

| Variable | Required | Default | What it is |
|---|---|---|---|
| `DISCORD_TOKEN` | yes | — | Bot token (**secret**) |
| `DISCORD_PUBLIC_KEY` | yes | — | Public key used to verify signatures |
| `APPLICATION_ID` | yes | — | Discord application ID |
| `GUILD_ID` | no | global | Server to register the command in |
| `GCP_PROJECT` | yes | — | Project ID (Cloud Run's `GOOGLE_CLOUD_PROJECT` also works) |
| `SERVICE_URL` | yes | — | The service's public URL; Cloud Tasks calls `${SERVICE_URL}/close` |
| `TASKS_LOCATION` | no | `us-east1` | Queue region |
| `TASKS_QUEUE` | no | `lilibot-close` | Queue name |
| `PORT` | no | `8080` | Listening port |

---

## Cost

| Service | What for | Free tier | Expected real usage |
|---|---|---|---|
| Cloud Run | The interactions endpoint | 2M req · 180,000 vCPU-s · 360,000 GiB-s / month | ~500 req/month |
| Firestore | Rotation memory | 50k reads · 20k writes **per day** · 1 GiB | dozens per day |
| Cloud Tasks | Scheduled close | 1M operations/month | 1 per sign-up |
| Artifact Registry | The image | 0.5 GB | ~60 MB, with automatic cleanup |
| Secret Manager | Token and public key | 6 versions · 10k accesses/month | 2 versions |

**Expected total: $0.00/month**, with three or more orders of magnitude of headroom on every
limit.

`provision.sh` leaves a $1 budget alert in place so you find out within days, not at the end of
the month, if anything drifts.

---

## Local development

```bash
pnpm install
pnpm test        # 55 tests
pnpm typecheck
```

The tests drive the real server with **real Ed25519 signatures** and an in-memory Firestore:
the full flow (PING, `/rotacion`, joining, leaving, closing and rotating) is verified without
GCP and without Discord.

To actually run it locally:

```bash
cp env.example .env   # fill in the variables
pnpm dev
```

Note that Discord needs a **public** URL to call, so local work needs a tunnel
(`cloudflared tunnel --url http://localhost:8080` or similar) with that URL set as the
Interactions Endpoint URL while you develop.

---

## Project layout

```
src/
  domain/rotation.ts       the draw rule: randomness and immunity. No I/O
  domain/pool.ts           joining and leaving a sign-up. No I/O
  discord/verify.ts        Ed25519 verification of every request
  discord/rest.ts          calls to the Discord API
  discord/render.ts        embeds and buttons as JSON
  gcp/auth.ts              access token from the metadata server
  gcp/firestore.ts         Firestore REST client
  gcp/tasks.ts             scheduling the close on Cloud Tasks
  state/rotations.ts       the rotation document, with optimistic retry
  state/memory.ts          in-memory Firestore, for the tests
  handlers/                the command, the buttons and the shared close
  server.ts                routing and dispatch
  index.ts                 HTTP server
  deploy-commands.ts       slash command registration
deploy/
  provision.sh             infrastructure, once
  deploy.sh                build and deploy
docs/prd/                  PRDs for both versions
```

The logic that actually matters (`src/domain/`) knows nothing about Discord or Google, so it is
tested in full without a network.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| The Interactions Endpoint URL won't turn green | Wrong `DISCORD_PUBLIC_KEY`. It is the **Public Key**, not the token |
| "The application did not respond" | The handler took longer than 3 s. Check the logs; usually Firestore permissions |
| `/rotacion` doesn't appear | You didn't run `pnpm commands`, or registered globally (up to 1 h to propagate) |
| The sign-up never closes on its own | The Cloud Tasks queue is missing, or `roles/cloudtasks.enqueuer` is not granted |
| `PERMISSION_DENIED` from Firestore | `roles/datastore.user` missing, or the database was never created |
| Charges appear on the bill | Check the region: outside the three US ones there is no free tier |
| A button says the sign-up is closed | It passed its `closesAt`, or somebody closed it first |

Behaviour that looks odd but is intended:

- One open sign-up per channel. A second `/rotacion` is refused until the first closes.
- Closing with the button leaves the scheduled task pending: when it fires it finds nothing to
  close and does nothing.
- An empty sign-up does **not** clear the rotation memory: nobody played, so nobody paid their
  turn off.

---

## Uninstalling

```bash
gcloud run services delete lilibot --region=us-east1
```

That leaves the account with nothing that can bill. Firestore, the queue and the secrets are
empty and free; delete them too for a completely clean slate:

```bash
gcloud tasks queues delete lilibot-close --location=us-east1
gcloud secrets delete lilibot-discord-token
gcloud secrets delete lilibot-discord-public-key
gcloud firestore databases delete --database='(default)'
```
