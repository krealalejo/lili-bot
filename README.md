# lilibot

Bot de Discord para repartir las plazas de un grupo de juego que solo admite **5 personas por
partida**. Abre una convocatoria, la gente se apunta pulsando un botón, y al cerrarse sortea a
quién le toca quedarse fuera — recordando a los de la ronda anterior para que no caigan siempre
los mismos.

Corre en Google Cloud Run **por 0 €/mes**.

## Cómo funciona

1. `/rotacion` publica una convocatoria con los botones **Apuntarme**, **Salir** y
   **Cerrar convocatoria**.
2. La gente pulsa Apuntarme. Cada persona cuenta una vez, por mucho que pulse.
3. Se cierra por tiempo o por el botón, lo que ocurra antes. Puede cerrarla cualquiera del canal.
4. Reparto:
   - **5 o menos** apuntados → juegan todos, no hay rotación (y se borra la memoria).
   - **Más de 5** → los sobrantes se sortean al azar. Quien se quedó fuera la ronda pasada
     tiene **plaza asegurada** y no entra en el sorteo.
   - Si los inmunes son más de 5, se sortean las 5 plazas **entre ellos** y los que se quedan
     fuera mantienen la inmunidad para la siguiente.
5. Los nominados de esta ronda son los inmunes de la próxima. Eso es toda la rotación.

La memoria es por canal: cada canal lleva su propia rotación.

## Arquitectura

```
Discord ──POST /interactions──► Cloud Run (escala a cero)
                                   │  verifica Ed25519, luego actúa
                                   ├──► Firestore    rotations/{channelId}
                                   ├──► Discord REST (token del bot)
                                   └──► Cloud Tasks  programa el cierre
Cloud Tasks ──POST /close (a la hora)──► Cloud Run
```

No hay gateway ni WebSocket: Discord llama al bot, no al revés. Por eso no hace falta un
proceso encendido todo el día, y por eso el apuntarse es un botón y no una reacción — las
reacciones solo existen en el gateway.

**Cero dependencias de runtime.** Ni `discord.js` ni SDKs de Google: Node 24 trae Ed25519 en
WebCrypto y `fetch`, y las APIs de Google se hablan por REST con el token del metadata server.
Eso deja la imagen en lo mínimo y el arranque en **~85 ms**, que es lo que mantiene al bot
dentro del límite de 3 segundos que impone Discord.

## Estructura

```
src/
  domain/rotation.ts       la regla de reparto: sorteo e inmunidad. Sin I/O
  domain/pool.ts           entrar y salir de una convocatoria. Sin I/O
  discord/verify.ts        verificación Ed25519 de cada petición
  discord/rest.ts          llamadas a la API de Discord
  discord/render.ts        embeds y botones como JSON
  gcp/auth.ts              token de acceso del metadata server
  gcp/firestore.ts         cliente REST de Firestore
  gcp/tasks.ts             programación del cierre en Cloud Tasks
  state/rotations.ts       el documento de rotación, con reintento optimista
  state/memory.ts          Firestore en memoria, para los tests
  handlers/               el comando, los botones y el cierre compartido
  server.ts                rutas y despacho
  index.ts                 servidor HTTP
  deploy-commands.ts       registro del slash command
```

La lógica que de verdad importa (`src/domain/`) no sabe que existen Discord ni Google, así que
se prueba entera sin red.

## Desarrollo

```bash
pnpm install
pnpm test        # 55 tests
pnpm typecheck
```

Los tests mueven el servidor real con firmas Ed25519 reales y un Firestore en memoria: el flujo
completo (PING, `/rotacion`, apuntarse, cerrar, rotar) se verifica sin GCP y sin Discord.

Para ejecutar en local hace falta un `.env` con `DISCORD_TOKEN`, `APPLICATION_ID`,
`DISCORD_PUBLIC_KEY`, `GCP_PROJECT` y `SERVICE_URL` (copia `env.example`), y después
`pnpm dev`. Ten en cuenta que Discord necesita una URL pública para llamarte, así que en local
hace falta un túnel.

## Despliegue

Ver **[docs/deploy-gcp.md](docs/deploy-gcp.md)**. Resumen:

```bash
PROJECT_ID=tu-proyecto ./deploy/provision.sh
PROJECT_ID=tu-proyecto APPLICATION_ID=123456789 ./deploy/deploy.sh
```

Y pegar `https://TU-SERVICIO.run.app/interactions` en el Interactions Endpoint URL del
Developer Portal.

> El free tier de Cloud Run solo existe en `us-central1`, `us-east1` y `us-west1`. Los scripts
> rechazan cualquier otra región para que no te lleves una factura por sorpresa.

## Notas

- Una convocatoria abierta por canal. El segundo `/rotacion` se rechaza hasta cerrar la primera.
- Si la convocatoria caduca, el botón de apuntarse contesta que ya está cerrada.
- El cierre por botón deja la tarea programada en el aire: cuando salta, no encuentra nada que
  cerrar y no hace nada.
- Una convocatoria vacía **no** borra la memoria de rotación: nadie jugó, nadie pagó su turno.
