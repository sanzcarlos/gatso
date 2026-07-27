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

- Node.js >= 26
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

## Despliegue

En Vercel, el proyecto se detecta automaticamente como pnpm por la
presencia de `pnpm-lock.yaml`. `vercel.json` fija explicitamente
`installCommand: pnpm install` y `buildCommand: pnpm build` por claridad.
Variables de entorno necesarias: `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_COOKIE_NAME`, `RATE_LIMIT_EXPENSE_CREATION_SECONDS`.
