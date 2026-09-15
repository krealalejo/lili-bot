# lilibot

Bot de Discord para repartir las plazas de un grupo de juego que sólo admite **5 personas por
partida**. Abre una convocatoria, la gente se apunta reaccionando, y cuando se cierra el bot
sortea a quién le toca quedarse fuera — recordando a los de la ronda anterior para que no
caigan siempre los mismos.

## Cómo funciona

1. `/rotacion` publica un mensaje de convocatoria con un botón **Cerrar convocatoria**.
2. La gente reacciona con **cualquier emoji**. Da igual cuál, y da igual cuántos: cada persona
   cuenta una sola vez.
3. La convocatoria se cierra por tiempo o por el botón, lo que ocurra antes. Cualquiera del
   canal puede pulsarlo.
4. Reparto:
   - **5 o menos** apuntados → juegan todos, no hay rotación (y se borra la memoria).
   - **Más de 5** → los sobrantes se sortean al azar. Quien se quedó fuera la ronda pasada
     tiene **plaza asegurada** y no entra en el sorteo.
   - Si los inmunes son más de 5, se sortean las 5 plazas **entre ellos** y los que se quedan
     fuera mantienen la inmunidad para la siguiente.
5. Los nominados de esta ronda son los inmunes de la próxima. Eso es toda la rotación.

La memoria es por canal: cada canal lleva su propia rotación.

## Requisitos

- Node **24 o superior** (el proyecto ejecuta TypeScript directamente, sin paso de compilación)
- pnpm
- Una aplicación de Discord con su bot

## Instalación

```bash
pnpm install
cp env.example .env
```

Rellena `.env` con los valores de tu aplicación:

| Variable | Qué es |
|---|---|
| `DISCORD_TOKEN` | Token del bot (Discord Developer Portal → Bot → Reset Token) |
| `CLIENT_ID` | Application ID (General Information) |
| `GUILD_ID` | ID del servidor de pruebas. Con él los comandos aparecen al instante; déjalo vacío para registrarlos globalmente |

`.env` está en `.gitignore` — no lo subas.

## Configuración en el Developer Portal

1. **Bot → Privileged Gateway Intents**: no hace falta activar ninguno. El bot no lee mensajes.
2. **OAuth2 → URL Generator**: scopes `bot` y `applications.commands`.
3. Permisos del bot: `View Channel`, `Send Messages`, `Embed Links`, `Add Reactions`,
   `Read Message History`.
4. Invita el bot con la URL generada.

## Uso

```bash
pnpm commands   # registra /rotacion (una vez, y cada vez que cambie el comando)
pnpm dev        # arranca en modo watch
pnpm start      # arranca normal
```

En Discord:

```
/rotacion
/rotacion duracion:300
/rotacion duracion:60 nota:Ranked a las 22:00
```

| Opción | Por defecto | Rango |
|---|---|---|
| `duracion` | 120 s | 10 – 3600 s |
| `nota` | — | hasta 200 caracteres |

## Comandos de desarrollo

```bash
pnpm test       # tests de la lógica de reparto
pnpm typecheck  # tsc --noEmit
```

## Estructura

```
src/
  domain/rotation.ts       la regla de reparto, sin discord.js: sorteo e inmunidad
  domain/rotation.test.ts  tests de esa regla
  state/store.ts           memoria de la rotación + persistencia en data/state.json
  pools.ts                 convocatorias abiertas ahora mismo (sólo en memoria)
  commands/rotacion.ts     el comando, el ReactionCollector y el cierre
  index.ts                 cliente, intents y enrutado de interacciones
  deploy-commands.ts       registro del slash command
```

## Notas

- **Si el bot se reinicia con una convocatoria abierta, esa convocatoria se pierde.** La
  memoria de la rotación no: vive en `data/state.json` y se recarga al arrancar.
- Quitar un emoji no te borra de la lista. Sólo sales de la convocatoria cuando no te queda
  ninguna reacción en el mensaje.
- Si `data/state.json` se corrompe, el bot arranca sin memoria en lugar de caerse.
- Una convocatoria abierta por canal. El segundo `/rotacion` se rechaza hasta que cierres la
  primera.
