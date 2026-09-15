#!/usr/bin/env bash
#
# One-shot setup of everything lilibot needs on Google Cloud.
# Safe to re-run: every step tolerates the resource already existing.
#
# Usage:  PROJECT_ID=my-project ./deploy/provision.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to your Google Cloud project id}"
REGION="${REGION:-us-east1}"
QUEUE="${QUEUE:-lilibot-close}"
SA_NAME="${SA_NAME:-lilibot-run}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
TOKEN_SECRET="lilibot-discord-token"
PUBKEY_SECRET="lilibot-discord-public-key"

# Cloud Run's free tier exists only in these three regions. Anywhere else bills from
# the first second, which is exactly what this deployment is trying to avoid.
case "${REGION}" in
  us-central1 | us-east1 | us-west1) ;;
  *)
    echo "REGION=${REGION} is outside Cloud Run's free tier." >&2
    echo "Use us-central1, us-east1 or us-west1." >&2
    exit 1
    ;;
esac

echo "==> Project ${PROJECT_ID}, region ${REGION}"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  firestore.googleapis.com \
  cloudtasks.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

echo "==> Firestore database"
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  echo "    already exists"
else
  gcloud firestore databases create --location="${REGION}" --type=firestore-native
fi

echo "==> Service account"
if gcloud iam service-accounts describe "${SA_EMAIL}" >/dev/null 2>&1; then
  echo "    already exists"
else
  gcloud iam service-accounts create "${SA_NAME}" --display-name="lilibot Cloud Run service"
fi

echo "==> Secrets"
# Read from stdin so the values never appear in this script, in your shell history,
# or in any log.
create_secret() {
  local name="$1" prompt="$2"
  if gcloud secrets describe "${name}" >/dev/null 2>&1; then
    echo "    ${name} exists — to rotate: gcloud secrets versions add ${name} --data-file=-"
    return
  fi
  echo "    paste ${prompt}, then press Enter and Ctrl-D:"
  gcloud secrets create "${name}" --replication-policy=automatic --data-file=-
}

create_secret "${TOKEN_SECRET}" "the Discord BOT TOKEN"
create_secret "${PUBKEY_SECRET}" "the Discord PUBLIC KEY"

echo "==> IAM (least privilege: only what the service actually calls)"
for secret in "${TOKEN_SECRET}" "${PUBKEY_SECRET}"; do
  gcloud secrets add-iam-policy-binding "${secret}" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role=roles/secretmanager.secretAccessor >/dev/null
done

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/datastore.user >/dev/null

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role=roles/cloudtasks.enqueuer >/dev/null

echo "==> Cloud Tasks queue"
if gcloud tasks queues describe "${QUEUE}" --location="${REGION}" >/dev/null 2>&1; then
  echo "    already exists"
else
  gcloud tasks queues create "${QUEUE}" --location="${REGION}"
fi

echo "==> Artifact Registry cleanup policy"
# The free tier is 0.5 GB. Without this, every deploy adds another image forever.
policy_file="$(mktemp)"
cat >"${policy_file}" <<'POLICY'
[
  {"name": "keep-recent", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 3}},
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"olderThan": "30d"}}
]
POLICY
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location="${REGION}" --policy="${policy_file}" >/dev/null 2>&1 \
  || echo "    repository not created yet — re-run this script after the first deploy"
rm -f "${policy_file}"

echo "==> Budget alert (tripwire: this deployment should cost nothing)"
BILLING_ACCOUNT="$(gcloud billing projects describe "${PROJECT_ID}" \
  --format='value(billingAccountName)' 2>/dev/null | sed 's|billingAccounts/||')"
if [[ -n "${BILLING_ACCOUNT}" ]]; then
  gcloud billing budgets create \
    --billing-account="${BILLING_ACCOUNT}" \
    --display-name="lilibot tripwire" \
    --budget-amount=1USD \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=1.0 \
    --filter-projects="projects/${PROJECT_ID}" >/dev/null 2>&1 \
    || echo '    could not create the budget — add a $1 budget by hand in the console'
else
  echo '    no billing account found — add a $1 budget by hand in the console'
fi

echo
echo "Provisioning done. Now deploy:"
echo "  PROJECT_ID=${PROJECT_ID} APPLICATION_ID=<discord app id> ./deploy/deploy.sh"
