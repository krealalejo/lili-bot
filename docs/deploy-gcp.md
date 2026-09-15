# Despliegue en Google Cloud (gratis)

Todo lo que usa este bot cabe en el **Always Free** de GCP. No hay VM, no hay IP pública que
pagar, y el servicio escala a cero entre convocatorias.

| Servicio | Para qué | Free tier | Uso real esperado |
|---|---|---|---|
| Cloud Run | El endpoint de interacciones | 2M req · 180.000 vCPU-s · 360.000 GiB-s / mes | ~500 req/mes |
| Firestore | Memoria de rotación | 50k lecturas · 20k escrituras **al día** · 1 GiB | decenas al día |
| Cloud Tasks | Cierre programado | 1M operaciones/mes | 1 por convocatoria |
| Artifact Registry | La imagen | 0,5 GB | ~60 MB, con limpieza automática |
| Secret Manager | Token y clave pública | 6 versiones · 10k accesos/mes | 2 versiones |

> **La región importa.** El free tier de Cloud Run existe **solo** en `us-central1`,
> `us-east1` y `us-west1`. Desplegar en `europe-west1` factura desde el primer segundo.
> Los scripts rechazan cualquier otra región. `us-east1` es la más cercana a España.

---

## 0. Requisitos

- Una aplicación de Discord con su bot creado
- Un proyecto de GCP con facturación activada (el free tier la exige, aunque no cobre)
- `gcloud` instalado y autenticado: `gcloud auth login`

Del Developer Portal necesitas tres datos:

| Dónde | Qué |
|---|---|
| General Information → **Application ID** | `APPLICATION_ID` (no es secreto) |
| General Information → **Public Key** | `DISCORD_PUBLIC_KEY` (no es secreto, pero es lo que valida las firmas) |
| Bot → **Reset Token** | `DISCORD_TOKEN` (**secreto**) |

---

## 1. Provisionar

```bash
PROJECT_ID=tu-proyecto ./deploy/provision.sh
```

Habilita las APIs, crea la base de datos Firestore, la cuenta de servicio, la cola de Cloud
Tasks, la política de limpieza de imágenes y un **presupuesto de aviso de 1 $** como alarma.

Te pedirá pegar el bot token y la public key por stdin. No se escriben en ningún fichero ni
quedan en el historial del shell.

Permisos que recibe la cuenta de servicio, y ninguno más:

- `roles/secretmanager.secretAccessor` sobre los dos secretos concretos
- `roles/datastore.user` (Firestore)
- `roles/cloudtasks.enqueuer` (crear la tarea de cierre)

## 2. Desplegar

```bash
PROJECT_ID=tu-proyecto APPLICATION_ID=123456789 ./deploy/deploy.sh
```

La primera vez despliega dos veces: `SERVICE_URL` tiene que existir como variable de entorno,
pero esa URL no existe hasta que el servicio existe. A partir de ahí, un solo despliegue.

Al terminar imprime la URL del servicio.

## 3. Conectar Discord

1. Developer Portal → General Information → **Interactions Endpoint URL**:
   `https://TU-SERVICIO.run.app/interactions`
2. Guardar. Discord manda un PING firmado; si el campo no se pone verde, mira los logs
   (abajo). No continúes hasta que lo haga.
3. Registrar el comando:

```bash
DISCORD_TOKEN=... APPLICATION_ID=... GUILD_ID=... pnpm commands
```

Con `GUILD_ID` el comando aparece al instante en ese servidor; sin él se registra global y
tarda hasta una hora.

4. Invitar el bot con scopes `bot` y `applications.commands`, y permisos
   `View Channel`, `Send Messages`, `Embed Links`.

**No hace falta activar ningún Privileged Gateway Intent.** El bot no usa el gateway.

---

## 4. Despliegue automático (opcional)

El workflow `.github/workflows/deploy.yml` despliega al hacer push a `main`. Usa **Workload
Identity Federation**, así que no se guarda ninguna clave de servicio en GitHub.

```bash
PROJECT_ID=tu-proyecto
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

En GitHub → Settings:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/github-oidc` |
| Secret | `DEPLOY_SERVICE_ACCOUNT` | `lilibot-deploy@<PROJECT_ID>.iam.gserviceaccount.com` |
| Variable | `GCP_PROJECT_ID` | tu project id |
| Variable | `DISCORD_APPLICATION_ID` | tu application id |

`attribute-condition` limita el acceso a **este** repositorio: otro repo con el mismo proveedor
no puede desplegar.

---

## 5. Comprobar que funciona

```bash
# El servicio responde
curl -s https://TU-SERVICIO.run.app/healthz

# Una petición sin firmar debe dar 401 — es la única puerta que tiene el servicio
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  -H 'Content-Type: application/json' -d '{"type":1}' \
  https://TU-SERVICIO.run.app/interactions

# Arranque en frío: fuerza escala a cero esperando unos minutos y mide el primer PING
curl -s -o /dev/null -w 'cold start: %{time_total}s\n' https://TU-SERVICIO.run.app/healthz

# Logs
gcloud run services logs read lilibot --region=us-east1 --limit=50

# Coste real
gcloud billing accounts list
```

Arranque medido en local, sin contenedor: **~85 ms** hasta la primera respuesta. En Cloud Run
hay que sumar el arranque del contenedor; el margen contra los 3 segundos de Discord es amplio.

---

## Problemas típicos

| Síntoma | Causa |
|---|---|
| El endpoint no se pone verde | `DISCORD_PUBLIC_KEY` equivocada. Es la *Public Key*, no el token |
| "The application did not respond" | El handler tardó más de 3 s. Mira los logs; suele ser Firestore sin permisos |
| El comando no aparece | No has ejecutado `pnpm commands`, o lo registraste global (tarda hasta 1 h) |
| La convocatoria no se cierra sola | La cola de Cloud Tasks no existe o falta `roles/cloudtasks.enqueuer` |
| `PERMISSION_DENIED` de Firestore | Falta `roles/datastore.user`, o la base de datos no se creó |
| Aparece coste | Mira la región: fuera de las tres de EE. UU. no hay free tier |

## Volver atrás

```bash
gcloud run services delete lilibot --region=us-east1
```

Eso deja la cuenta sin nada que pueda facturar. Firestore y la cola quedan vacíos y son
gratuitos; bórralos también si quieres dejarlo completamente limpio.
