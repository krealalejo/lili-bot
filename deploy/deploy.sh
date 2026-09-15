#!/usr/bin/env bash
#
# Build and deploy lilibot to Cloud Run.
#
# Usage:  PROJECT_ID=my-project APPLICATION_ID=123456 ./deploy/deploy.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID to your Google Cloud project id}"
APPLICATION_ID="${APPLICATION_ID:?set APPLICATION_ID to your Discord application id}"
REGION="${REGION:-us-east1}"
SERVICE="${SERVICE:-lilibot}"
QUEUE="${QUEUE:-lilibot-close}"
SA_EMAIL="${SA_NAME:-lilibot-run}@${PROJECT_ID}.iam.gserviceaccount.com"

case "${REGION}" in
  us-central1 | us-east1 | us-west1) ;;
  *)
    echo "REGION=${REGION} is outside Cloud Run's free tier." >&2
    exit 1
    ;;
esac

# SERVICE_URL is needed as an environment variable, but it only exists once the service
# does. First deploy without it, read the URL back, then deploy again with it. Only the
# very first run pays this cost; afterwards the URL is already known.
service_url() {
  gcloud run services describe "${SERVICE}" --region="${REGION}" \
    --format='value(status.url)' 2>/dev/null || true
}

deploy() {
  local url="$1"
  gcloud run deploy "${SERVICE}" \
    --source . \
    --region="${REGION}" \
    --service-account="${SA_EMAIL}" \
    --allow-unauthenticated \
    --min-instances=0 \
    --max-instances=2 \
    --memory=256Mi \
    --cpu=1 \
    --concurrency=20 \
    --timeout=60s \
    --cpu-boost \
    --set-secrets="DISCORD_TOKEN=lilibot-discord-token:latest,DISCORD_PUBLIC_KEY=lilibot-discord-public-key:latest" \
    --set-env-vars="APPLICATION_ID=${APPLICATION_ID},GCP_PROJECT=${PROJECT_ID},TASKS_LOCATION=${REGION},TASKS_QUEUE=${QUEUE},SERVICE_URL=${url}"
}

URL="$(service_url)"
if [[ -z "${URL}" ]]; then
  echo "==> First deploy (the service URL does not exist yet)"
  # A placeholder that satisfies config validation; the second pass fixes it.
  deploy "https://placeholder.invalid"
  URL="$(service_url)"
  echo "==> Re-deploying now that the URL is known: ${URL}"
fi

deploy "${URL}"

echo
echo "Deployed: ${URL}"
echo
echo "Next:"
echo "  1. Discord Developer Portal -> General Information -> Interactions Endpoint URL:"
echo "       ${URL}/interactions"
echo "     Save. Discord PINGs it; it must go green."
echo "  2. Register the slash command:"
echo "       DISCORD_TOKEN=... APPLICATION_ID=${APPLICATION_ID} GUILD_ID=... pnpm commands"
