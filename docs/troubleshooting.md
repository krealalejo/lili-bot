[← Back to the README](../README.md)

# Troubleshooting

## Symptoms

| Symptom | Cause |
|---|---|
| The Interactions Endpoint URL won't turn green | Wrong `DISCORD_PUBLIC_KEY`. It is the **Public Key** from General Information, not the bot token |
| "The application did not respond" | The handler took longer than 3 s. Check the logs; usually Firestore permissions |
| `/rotacion` doesn't appear | You didn't run `pnpm commands`, or registered globally (up to 1 h to propagate) |
| The sign-up never closes on its own | The Cloud Tasks queue is missing, or `roles/cloudtasks.enqueuer` is not granted |
| `PERMISSION_DENIED` from Firestore | `roles/datastore.user` missing, or the database was never created |
| Charges appear on the bill | Check the region: outside `us-central1`, `us-east1` and `us-west1` there is no free tier |
| A button says the sign-up is closed | It passed its `closesAt`, or somebody closed it first |
| The GitHub `deploy` job fails | Workload Identity Federation is not configured yet. `verify` still passing means the code is fine — see [Deployment](deployment.md#automatic-deploys-from-github) |
| Everyone got benched again | Check `immune` in the document: an empty sign-up between rounds does not clear it, but a round with 5 or fewer players does |

## Behaviour that looks odd but is intended

- **One open sign-up per channel.** A second `/rotacion` is refused until the first closes.
- **Closing with the button leaves the scheduled task pending.** When it fires it finds nothing
  to close and does nothing. That is cheaper than deleting the task.
- **An empty sign-up does not clear the rotation memory.** Nobody played, so nobody paid their
  turn off.
- **A round with 5 or fewer players clears it.** Nobody sat out, so nobody is owed a seat.
- **Immune players can still be seen in the nominee list** if more than five of them signed up:
  the five seats are drawn among the immune, and whoever misses out keeps immunity for the
  round after.

## Digging in

```bash
# Recent logs
gcloud run services logs read lilibot --region=us-east1 --limit=50

# Follow them
gcloud beta run services logs tail lilibot --region=us-east1

# What a channel's state actually is
gcloud firestore documents get \
  "projects/YOUR-PROJECT/databases/(default)/documents/rotations/CHANNEL_ID"

# Is the service even up
curl -s https://YOUR-SERVICE.run.app/healthz

# Are tasks queued
gcloud tasks queues describe lilibot-close --location=us-east1
```

### Checking a signature failure

A `401` from `/interactions` means the Ed25519 check failed. In order of likelihood:

1. `DISCORD_PUBLIC_KEY` is wrong or has whitespace around it
2. Something between Discord and Cloud Run modified the body (a proxy, a rewrite)
3. The request genuinely was not from Discord — which is the check doing its job

The verification itself is covered by `src/discord/verify.test.ts`, including tampered bodies
and replayed timestamps, so a failure here is configuration rather than code.

### Resetting a channel's rotation

If the memory gets into a state you do not want, delete the document. The next `/rotacion`
starts from a clean slate with nobody immune.

```bash
gcloud firestore documents delete \
  "projects/YOUR-PROJECT/databases/(default)/documents/rotations/CHANNEL_ID"
```

---

**Next:** [Deployment](deployment.md) · [Discord setup](discord-setup.md) ·
[Architecture](architecture.md)
