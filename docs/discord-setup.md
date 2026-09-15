[← Back to the README](../README.md)

# Discord setup

Everything on the Discord side, from creating the application to seeing `/rotacion` appear in
your server.

The service has to exist before the last step, so if you have not deployed yet, do
[Deployment](deployment.md) first and come back for
[Step 4](#step-4--connect-discord-to-the-service).

---

## Step 1 — Create the application

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

On the Google side you only need your **GCP project ID**; the deployment scripts create
everything else.

> **The token is never written into a file in this repository.** `deploy/provision.sh` reads it
> from stdin and stores it in Secret Manager; Cloud Run injects it as an environment variable at
> runtime. `.env` is gitignored.

---

## Step 3 — Deploy the service

The Interactions Endpoint URL needs a running service to point at, so deploy first:
**[Deployment guide](deployment.md)**.

---

## Step 4 — Connect Discord to the service

1. Developer Portal → **General Information** → **Interactions Endpoint URL**:

   ```
   https://YOUR-SERVICE.run.app/interactions
   ```

2. Click **Save**. Discord sends a signed PING and the field must turn **green**. If it does
   not, stop here and see [Troubleshooting](troubleshooting.md).

3. Register the slash command:

   ```bash
   cp env.example .env     # fill in DISCORD_TOKEN, APPLICATION_ID and GUILD_ID
   pnpm commands
   ```

4. Type `/rotacion` in your server.

---

## Step 5 — Check it end to end

Run `/rotacion duracion:60`, have 7 people join, close it, and confirm 5 are playing and 2 are
nominated. Run it again — **neither of those 2 may be left out a second time**.

That second round is the real test: it is the only thing that proves the rotation memory
survived, since it lives in Firestore rather than in the process.

---

## Command reference

| Option | Default | Range |
|---|---|---|
| `duracion` | 120 s | 10 – 3600 s |
| `nota` | — | up to 200 characters |

```
/rotacion
/rotacion duracion:300
/rotacion duracion:60 nota:Ranked a las 22:00
```

The bot's Discord-facing text is in Spanish, matching the server it was built for. It lives in
`src/discord/render.ts` if you want to change it.

---

**Next:** [Deployment](deployment.md) · [Troubleshooting](troubleshooting.md) ·
[Architecture](architecture.md)
