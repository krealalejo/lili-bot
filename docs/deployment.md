[← Back to the README](../README.md)

# Deployment to Google Cloud

Everything this bot uses fits inside GCP's **Always Free** tier. There is no VM, no public IP
to pay for, and the service scales to zero between sign-ups.

You need the keys from [Discord setup](discord-setup.md) before starting.

---

## Prerequisites

- A GCP project with **billing enabled** (the free tier requires it even though it charges
  nothing)
- [`gcloud`](https://cloud.google.com/sdk/docs/install) installed and authenticated:
  `gcloud auth login`

> ### ⚠️ The region matters
> Cloud Run's free tier exists **only** in `us-central1`, `us-east1` and `us-west1`. Deploying
> to `europe-west1` or anywhere else bills from the first second. The scripts refuse any region
> other than those three, and default to **`us-east1`**, the closest of them to Europe.

---

## Step 1 — Provision the infrastructure

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

Rotating the bot token later does not need a redeploy:

```bash
gcloud secrets versions add lilibot-discord-token --data-file=-
```

---

## Step 2 — Deploy the service

```bash
PROJECT_ID=your-project APPLICATION_ID=123456789 ./deploy/deploy.sh
```

The first run deploys **twice**: `SERVICE_URL` has to exist as an environment variable, but
that URL does not exist until the service does. After that it is a single deploy each time.

When it finishes it prints the service URL. Keep it — [Discord setup step 4](discord-setup.md#step-4--connect-discord-to-the-service)
needs it.

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
> is how every HTTP Discord bot works. See [Architecture](architecture.md#security-model).

---

## Step 3 — Verify the deployment

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

Then finish the [Discord side](discord-setup.md#step-4--connect-discord-to-the-service).

---

## Environment variables

Cloud Run injects these: the two secrets from Secret Manager, the rest as plain variables.
`deploy/deploy.sh` sets them all — the table is here for when something looks wrong.

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

## Automatic deploys from GitHub

`.github/workflows/deploy.yml` deploys on push to `main`. It uses **Workload Identity
Federation**, so no long-lived service-account key is ever stored in GitHub.

Until these are configured the `deploy` job fails while `verify` (typecheck and tests) still
passes — expected, not a bug.

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

### Why not a VM

A gateway bot holds a WebSocket open permanently, which needs an always-on VM, which needs a
public IPv4 — and GCP bills that at $0.005/h, **$3.65/month**. Discord publishes no IPv6, so
that address cannot be avoided. Moving to HTTP interactions removed the persistent connection
and with it the whole cost. The reasoning is in [Architecture](architecture.md#why-http-interactions).

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

---

**Next:** [Discord setup](discord-setup.md) · [Troubleshooting](troubleshooting.md) ·
[Architecture](architecture.md)
