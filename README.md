# Gatso

Aplicacion web de control de gastos compartidos entre amigos (estilo
Splitwise), con privacidad por diseno.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript 7 (strict)
- pnpm (unico gestor de paquetes soportado, **no usar npm ni yarn**)
- Drizzle ORM + Neon serverless Postgres
- Despliegue en Vercel

Ver [`PROGRESS.md`](./PROGRESS.md) para arquitectura completa, esquema de
base de datos y estado del proyecto.

## Requisitos

- Node.js **24.x** (version fijada en `engines.node`; ver nota de
  compatibilidad con Vercel en la seccion de Despliegue)
- pnpm >= 11 (via `corepack enable`)

## Puesta en marcha

```bash
corepack enable
pnpm install
cp .env.example .env.local   # completar DATABASE_URL, AUTH_SECRET, etc.
pnpm db:generate             # genera migraciones SQL a partir de src/db/schema
pnpm db:migrate              # aplica migraciones contra DATABASE_URL
pnpm db:seed                 # inserta monedas iniciales (EUR, USD)
pnpm dev                     # http://localhost:3000
```

> `drizzle.config.ts` carga `.env.local` y `.env` explicitamente con
> `dotenv` porque `drizzle-kit` (a diferencia de `next dev`) no conoce la
> convencion `.env.local` de Next.js por si solo.

## Scripts

| Script | Descripcion |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Build de produccion |
| `pnpm start` | Sirve el build de produccion |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Tests con Vitest |
| `pnpm db:generate` | Genera migraciones Drizzle a partir del esquema |
| `pnpm db:migrate` | Aplica migraciones pendientes |
| `pnpm db:studio` | UI de inspeccion de la base de datos |
| `pnpm db:seed` | Inserta monedas iniciales (EUR, USD) si no existen |

## Despliegue en Vercel

### Configuracion del proyecto

En Vercel, el proyecto se detecta automaticamente como pnpm por la
presencia de `pnpm-lock.yaml`. `vercel.json` fija explicitamente
`framework: "nextjs"`, `installCommand: pnpm install` y
`buildCommand: pnpm build` por claridad (aunque Vercel los infiere solo).

### Variables de entorno (Project Settings → Environment Variables)

| Variable | Obligatoria | Notas |
|---|---|---|
| `DATABASE_URL` | Si | Cadena de conexion Neon. Usa una base de datos **distinta** (o una [branch de Neon](https://neon.tech/docs/introduction/branching)) para Preview vs Production si quieres aislar los datos de cada entorno. |
| `AUTH_SECRET` | Si | Genera uno nuevo especifico para produccion (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`); no reutilices el de desarrollo. |
| `AUTH_COOKIE_NAME` | No (default `gatso_session`) | Solo si quieres un nombre de cookie distinto. |
| `RATE_LIMIT_EXPENSE_CREATION_SECONDS` | No (default `30`) | Tambien ajustable en runtime sin redeploy via la tabla `app_config`. |
| `NODE_ENV` | **No la anadas** | Vercel la fija automaticamente a `production` en builds de Production y Preview; anadirla manualmente puede interferir con el propio proceso de build de Next.js. |

### Version de Node.js

`package.json` fija `engines.node: "24.x"` (no `26.x`): a fecha de este
despliegue, Vercel solo ofrece 20.x/22.x/24.x como runtime de Functions;
Node 26 todavia no esta disponible en la plataforma (sera Active LTS en
octubre de 2026). Next.js 16 solo requiere Node >= 20.9, asi que 24.x no
supone ninguna limitacion funcional. Cuando Vercel anada soporte para
26.x, actualiza `engines.node` y vuelve a desplegar.

### Migraciones de base de datos

El build de Vercel **no ejecuta migraciones automaticamente** (a
proposito: ejecutarlas en cada build de Preview contra la misma base de
datos de produccion seria peligroso). Hay dos formas de aplicarlas:

**Opcion A — GitHub Actions (recomendada, ver `.github/workflows/db-migrate.yml`)**

El workflow "Database Migrate" aplica `pnpm db:migrate` contra
produccion. Se dispara:

1. Automaticamente en un push a `main` que modifique `drizzle/**`
   (evita olvidarse de aplicar una migracion nueva tras el merge).
2. Manualmente desde GitHub → pestaña **Actions** → "Database Migrate" →
   **Run workflow**, escribiendo `migrate` en el campo de confirmacion.

Configuracion necesaria (una sola vez):

- Crea un **Environment** llamado `production` en
  `Settings → Environments` del repositorio (permite anadir revisores
  obligatorios antes de ejecutar el job, opcional pero recomendado).
- Anade el secret `DATABASE_URL` en ese environment (o en
  `Settings → Secrets and variables → Actions` si no usas Environments),
  con la misma cadena de conexion que usa el proyecto en Vercel para
  Production.

**Opcion B — Manual, desde tu maquina**

```bash
# Con DATABASE_URL apuntando a la base de datos de PRODUCCION
pnpm db:generate   # si hay cambios de esquema sin migracion generada
pnpm db:migrate    # aplica las migraciones pendientes
```

Ejecutalo con el `DATABASE_URL` de produccion exportado en la shell (o en
`.env.local` temporalmente) — nunca desde el propio `buildCommand` de
Vercel.

### Integracion continua (`.github/workflows/ci.yml`)

En cada push a `main` y en cada Pull Request se ejecutan `pnpm lint`,
`pnpm typecheck`, `pnpm test` y `pnpm build` en GitHub Actions. El paso de
build usa un `DATABASE_URL`/`AUTH_SECRET` ficticios (nunca se conecta
realmente a una base de datos: `src/lib/env.ts` solo valida el formato en
tiempo de build) para no depender de credenciales reales en un workflow
que corre en cualquier PR.

### Modulo nativo `argon2`

`argon2` (hash de contrasenas) incluye un binario nativo compilado para
Linux x64, la plataforma de build de Vercel; `pnpm-workspace.yaml` ya
autoriza sus scripts de instalacion (`allowBuilds`) para que se compile
sin prompts interactivos en CI. `next.config.ts` declara
`serverExternalPackages: ["argon2"]` y `outputFileTracingIncludes` para
las rutas de autenticacion, como red de seguridad frente a un problema
conocido de Next.js/Vercel donde el rastreador de archivos de las
funciones serverless no siempre detecta binarios nativos cargados de
forma dinamica.

### Region recomendada (opcional)

Si tu base de datos Neon esta en una region especifica (ej.
`eu-central-1`), en planes que permiten elegir region de Vercel Functions
(Project Settings → Functions → Region) usa la region mas cercana (ej.
`fra1` para Frankfurt) para minimizar la latencia entre la funcion y la
base de datos.
