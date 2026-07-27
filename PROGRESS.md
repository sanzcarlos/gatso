# PROGRESS.md — Gatso (control de gastos compartidos)

> Memoria persistente del proyecto. Leer este fichero al inicio de cada fase
> en vez de recorrer el codigo completo. Se actualiza al cierre de cada fase.

## Estado actual

**Fase completada: Fase 2.5 — Sistema de diseno (UI/UX) con TailwindCSS.**
Pendiente confirmacion del usuario para iniciar Fase 3 (Gastos y repartos).

## Stack confirmado (versiones reales verificadas en npm registry, no supuestas)

- Node.js **26.x** (LTS mas reciente en la fecha de trabajo)
- TypeScript **7.0.2** (compilador nativo, `type: module`, estricto)
- Next.js **16.2.12** (App Router), React **19.2.0**
- Gestor de paquetes: **pnpm 11.17.0**, fijado en `packageManager` de `package.json`
- ORM: **Drizzle ORM** sobre **Neon serverless Postgres** (`@neondatabase/serverless`, driver HTTP)
- Validacion: **zod 4**
- Hash de contrasenas: **argon2** (Fase 1)
- Sesiones: JWT firmado con **jose** + cookie httpOnly (Fase 1)

## Decision de base de datos (justificacion)

Se eligio **Neon Postgres (serverless) + Drizzle ORM** en lugar de Prisma:

- Drizzle no requiere un binary engine nativo empaquetado (Prisma si lo
  necesita), lo que evita problemas de cold-start y tamano de bundle en
  Vercel Serverless/Edge Functions.
- El driver `@neondatabase/serverless` funciona sobre HTTP/fetch, compatible
  tanto con el runtime `nodejs` como con `edge` de Next.js, ideal para
  funciones serverless de vida corta.
- Drizzle genera SQL explicito y tipado, mas facil de auditar para los
  requisitos de seguridad del proyecto (Fase 4/5).
- Vercel Postgres es, a fecha de esta decision, una capa sobre Neon; usar
  Neon directamente evita vendor lock-in adicional y funciona igual en
  Vercel via variables de entorno (`DATABASE_URL`).

## Estructura de carpetas (Next.js 16 App Router)

```
gatso/
├── .npmrc                    # auto-install-peers=true, shamefully-hoist=false
├── .env.example
├── package.json              # packageManager pnpm@11.17.0, engines node>=26
├── tsconfig.json             # strict, noUncheckedIndexedAccess, paths @/*
├── next.config.ts
├── vercel.json               # installCommand/buildCommand explicitos con pnpm
├── drizzle.config.ts         # schema en src/db/schema, out en drizzle/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/health/route.ts   # healthcheck runtime nodejs
│   ├── db/
│   │   ├── index.ts          # cliente drizzle (neon-http)
│   │   └── schema/
│   │       ├── users.ts
│   │       ├── currencies.ts
│   │       ├── groups.ts
│   │       ├── subgroups.ts
│   │       ├── memberships.ts       # memberships + subgroup_memberships
│   │       ├── expenses.ts          # expenses + expense_shares
│   │       ├── audit-logs.ts
│   │       ├── app-config.ts
│   │       └── index.ts      # barrel
│   ├── lib/
│   │   └── env.ts            # validacion zod de variables de entorno
│   └── types/                # (vacio, se llenara segun necesidad)
└── public/icons/              # placeholders para PWA (Fase 7)
```

## Esquema de base de datos (entidades y relaciones)

| Tabla | Descripcion | Claves / constraints relevantes |
|---|---|---|
| `users` | Usuario con alias (sin nombre real/email obligatorio) | `alias` unico; sin columna de IP |
| `currencies` | Catalogo de monedas (EUR, USD iniciales) | PK `code` (ISO 4217); `is_active`; limite 16 activas validado en app |
| `groups` | Grupo de gasto compartido | `invite_code` unico; `max_members`=64, `max_subgroups`=32 por defecto |
| `subgroups` | Subgrupo dentro de un grupo | FK `group_id`; unico `(group_id, name)`; limite 32/grupo validado en app |
| `memberships` | Usuario ⇄ Grupo con rol | enum `member_role` (`admin`,`member`); unico `(group_id, user_id)` |
| `subgroup_memberships` | Usuario ⇄ Subgrupo | unico `(subgroup_id, user_id)` |
| `expenses` | Gasto: pagador, importe, moneda, metodo de reparto | enum `split_method` (`equal`,`percentage`,`fixed`); FK moneda, grupo, subgrupo opcional |
| `expense_shares` | Reparto del gasto por usuario | suma de `share_amount` debe igualar `expenses.amount` (validado en servicio, Fase 3) |
| `audit_logs` | Auditoria inmutable (crear/editar/borrar) | jsonb `before_data`/`after_data`; inmutabilidad via regla/trigger SQL en Fase 5 |
| `app_config` | Configuracion runtime (ej. rate limit) | `key` unico; permite cambiar limites sin redeploy |

Notas de diseno:
- El patron **Strategy** para repartos se modela con el enum `split_method`
  en `expenses` + filas en `expense_shares`; anadir un metodo nuevo no
  requiere migrar el esquema, solo nueva logica de calculo en el servicio.
- La privacidad por diseno implica: no hay columna de nombre real ni email
  obligatorio en `users`, no se guarda IP en ninguna tabla.
- Las migraciones SQL (`drizzle/*.sql`) se generan con `pnpm db:generate` y
  se aplican con `pnpm db:migrate`; **aun no generadas** (bloqueado, ver
  "Bloqueos conocidos" abajo).

## Variables de entorno (`.env.example`)

- `DATABASE_URL` — cadena de conexion Neon/Postgres.
- `AUTH_SECRET` — secreto para firmar JWT de sesion (Fase 1).
- `AUTH_COOKIE_NAME` — nombre de la cookie httpOnly de sesion.
- `RATE_LIMIT_EXPENSE_CREATION_SECONDS` — valor por defecto del rate limit
  (30s); tambien puede overridearse en runtime via `app_config`.
- `NODE_ENV`.

## Configuracion pnpm

- `packageManager: "pnpm@11.17.0"` fijado en `package.json`.
- `.npmrc`: `auto-install-peers=true`, `shamefully-hoist=false` (no ha sido
  necesaria ninguna excepcion hasta ahora).
- `pnpm-lock.yaml` **no generado todavia** — ver bloqueo abajo. Se generara
  al ejecutar `pnpm install` en un entorno sin la restriccion.
- Proyecto mantenido como **paquete unico** (no monorepo/workspaces): a este
  tamano no aporta beneficio dividir en `apps/*` + `packages/*`; se
  reevaluara si aparece codigo compartido entre un futuro backend separado
  y el frontend.

## Bloqueos conocidos (importante)

- El entorno de ejecucion usado durante el desarrollo de esta fase tenia
  `pnpm.exe` bloqueado por politica de grupo de Windows (AppLocker/SRP) y
  sin `npm`/`corepack` disponibles en el PATH. Por tanto:
  - **No se ha ejecutado `pnpm install`** → no existe `pnpm-lock.yaml` ni
    `node_modules` todavia.
  - **No se han generado las migraciones SQL** (`pnpm db:generate`).
  - **No se ha verificado con `pnpm build`/`pnpm dev`** que el proyecto
    arranque; el codigo sigue los patrones estandar de Next.js 16 pero no
    esta verificado en runtime.
- Accion requerida por el usuario: ejecutar `pnpm install` (y opcionalmente
  `pnpm dev`, `pnpm db:generate`) en una terminal sin esa restriccion antes
  de continuar con Fase 1, o desbloquear `pnpm.exe` via politica de grupo.

## Fase 1 — Autenticacion y privacidad (completada)

### Decision clave: Next.js 16 renombra `middleware.ts` a `proxy.ts`

Verificado contra la documentacion oficial (nextjs.org, version 16.2.12):
desde v16.0.0 el fichero `middleware.ts` esta deprecado en favor de
`proxy.ts` (funcion `proxy`, export default). **Desde v15.5 el runtime
Node.js es estable y es el runtime por defecto de Proxy** (antes solo
Edge), lo que permite usar `node:crypto` directamente sin trucos ni
`experimental.nodeMiddleware`. Implementado en `src/proxy.ts`.

### Registro/login (Argon2id + alias, sin datos personales)

- `src/lib/auth/password.ts`: hash/verify con **argon2id** (params OWASP:
  memoryCost 19456 KiB, timeCost 2, parallelism 1). Incluye `DUMMY_HASH`
  (hash estatico valido) usado en login/recuperacion para que la respuesta
  tarde lo mismo si el alias existe o no, mitigando timing attacks que
  revelarian existencia de cuentas.
- `src/lib/validation/auth.ts`: esquemas zod — alias 3-32 chars
  `[a-zA-Z0-9_-]`, password minimo 10 caracteres. Sin campo de email ni
  nombre real en ningun esquema (por diseno).
- `src/app/api/auth/register/route.ts` — `POST`, crea usuario, genera codigo
  de recuperacion (ver abajo), devuelve sesion + codigo (una sola vez).
- `src/app/api/auth/login/route.ts` — `POST`, valida y crea sesion.
- `src/app/api/auth/logout/route.ts` — `POST`, borra cookie de sesion.
- `src/app/api/auth/me/route.ts` — `GET`, devuelve sesion actual o `null`.
- Paginas cliente minimas: `src/app/(auth)/{register,login,recover}/page.tsx`.

### Sesiones JWT + cookie httpOnly

- `src/lib/auth/session.ts`: JWT firmado HS256 con **jose**, secreto
  `env.AUTH_SECRET`, expiracion 30 dias. Cookie `httpOnly`, `sameSite=lax`,
  `secure` en produccion, nombre configurable via `AUTH_COOKIE_NAME`.
- `src/lib/auth/require-session.ts`: helper para proteger Route Handlers
  (`requireSession()` devuelve la sesion o un `NextResponse` 401 listo).

### Proteccion CSRF (double-submit cookie)

- `src/lib/auth/csrf-constants.ts` — nombres de cookie/header, sin
  dependencias (seguro para bundle de cliente).
- `src/lib/auth/csrf.ts` — logica servidor (`node:crypto`): genera token,
  compara en tiempo constante, detecta metodos "seguros".
- `src/lib/auth/csrf-client.ts` — lee el token desde `document.cookie` en
  cliente.
- `src/lib/api/client-fetch.ts` — `apiFetch()` wrapper que anade el header
  `x-csrf-token` automaticamente en POST/PUT/PATCH/DELETE.
- `src/proxy.ts` — fija la cookie CSRF si no existe (en cualquier GET) y
  **rechaza con 403** cualquier `/api/*` que mute estado sin
  header==cookie. Limitacion conocida: un cliente debe hacer al menos un
  GET antes de poder mutar (recibe la cookie); documentado aqui para no
  sorprender en integraciones futuras (apps moviles nativas, etc. necesitaran
  su propio manejo de cookies).

### Recuperacion de cuenta sin datos sensibles (Fase 1, trade-offs)

- Al registrarse, se genera un **codigo de recuperacion** legible
  (`XXXX-XXXX-XXXX-XXXX-XXXX`, alfabeto sin caracteres ambiguos) mostrado
  **una sola vez**; solo se guarda su hash Argon2id
  (`users.recovery_code_hash`).
- `POST /api/auth/recover` con `alias + recoveryCode + newPassword`:
  valida, actualiza contrasena y **rota** el codigo de recuperacion
  (se invalida el anterior, se entrega uno nuevo una sola vez).
- **Trade-off deliberado**: si el usuario pierde el codigo Y olvida la
  contrasena, la cuenta es irrecuperable — no se recolecta email/telefono
  por el principio de minima informacion posible. Es una decision de
  privacidad consciente, documentada tambien en la UI de `/recover`.

### Verificacion de versiones reales de dependencias

Todas las versiones en `package.json` fueron verificadas contra el registro
de npm (no inventadas) en el momento de escribir este documento:
`drizzle-orm@0.45.2`, `@neondatabase/serverless@1.1.0`, `zod@4.4.3`,
`argon2@0.45.1`, `jose@6.2.4`, `nanoid@6.0.0`, `react@19.2.8`,
`drizzle-kit@0.31.10`, `eslint@10.8.0`, `eslint-config-next@16.2.12` (debe
igualar la version de `next`), `vitest@4.1.10`. Se anadio `eslint.config.mjs`
con el patron oficial de Next.js 16 (flat config, `defineConfig` +
`nextVitals` + `nextTs` + `globalIgnores`) ya que `next lint` fue eliminado
en v16 a favor del CLI de ESLint directo (`pnpm lint` → `eslint .`).

### Pendiente / bloqueos que persisten

- Sigue bloqueado `pnpm install` en el entorno de desarrollo (ver Fase 0).
  Por tanto: dependencias (`argon2`, `jose`, `nanoid`, `zod`) estan
  declaradas en `package.json` pero **no instaladas**; nada de esto se ha
  podido compilar, testear ni ejecutar en runtime real todavia.
- `argon2` es un modulo nativo (native bindings) — al desplegar en Vercel
  confirmar que el build target (Node.js runtime, no Edge) sea compatible;
  las rutas de auth ya fijan `export const runtime = "nodejs"` explicitamente
  por esta razon.
- No se ha implementado rate limiting todavia (llega en Fase 3, incluye el
  limite de creacion de gastos; podria reusarse la misma infraestructura
  para throttling de login/registro si se decide en una fase posterior).
- No hay verificacion de fuerza de contrasena mas alla de longitud minima
  (10 caracteres); se considera suficiente para el alcance actual.

## Fase 2 — Grupos y subgrupos (completada)

### Decision revisada: driver Neon `neon-serverless` (WebSocket/Pool) en vez de `neon-http`

Verificado contra la documentacion oficial de Drizzle (`orm.drizzle.team/docs/connect-neon`
y `.../docs/transactions`): **el driver `neon-http` solo soporta consultas HTTP
individuales no interactivas; no soporta `db.transaction()` con multiples
pasos condicionales**. Cita textual de los docs: *"Querying over HTTP is
faster for single, non-interactive transactions. If you need session or
interactive transaction support [...] you can use the WebSocket-based
`neon-serverless` driver."*

Gatso necesita transacciones interactivas reales para varias operaciones
criticas de integridad (crear grupo+membresia admin atomicamente, mas
adelante crear gasto+repartos en Fase 3, rotar codigo de recuperacion
junto al futuro registro de auditoria en Fase 5). Por tanto, en `src/db/index.ts`
se sustituyo `neon()` + `drizzle-orm/neon-http` por `Pool` (WebSocket) +
`drizzle-orm/neon-serverless`, con `neonConfig.webSocketConstructor = ws`
(paquete `ws` + `bufferutil` anadidos como dependencias, siguiendo el
snippet oficial para entornos Node.js). Como todas las rutas de API ya
fijan `export const runtime = "nodejs"` (requerido por `argon2` desde
Fase 1), esto es compatible sin cambios adicionales de runtime.

### Control de concurrencia con `SELECT ... FOR UPDATE`

Para evitar condiciones de carrera al comprobar limites (64 miembros/grupo,
32 subgrupos/grupo) bajo peticiones concurrentes, `joinGroupByInviteCode` y
`createSubgroup` bloquean la fila del grupo con `.for("update")` dentro de
la transaccion antes de contar y insertar. Verificado que `.for("update")`
es una API real y ampliamente usada de `drizzle-orm/pg-core` (confirmado
via busqueda de codigo publico, no solo documentacion).

### Servicio de grupos (`src/lib/groups/service.ts`)

- `createGroup(userId, name)` — transaccion: inserta grupo con codigo de
  invitacion aleatorio (`generateInviteCode`, alfabeto sin ambiguedades) +
  membresia `admin` para el creador. Reintenta hasta 5 veces si el codigo
  colisiona (deteccion via `isUniqueViolation`, SQLSTATE `23505`).
- `requireMembership` / `requireGroupAdmin` — helpers de autorizacion que
  lanzan `AppError` (403) si no se cumple la condicion; reutilizados en
  todos los servicios de grupos/subgrupos/gastos futuros.
- `listUserGroups`, `getGroupDetail` (incluye contador de miembros y
  subgrupos), `updateGroupName` (solo admin).
- `joinGroupByInviteCode` — transaccion con bloqueo de fila, valida que no
  se supere `maxMembers` (64) y que el usuario no sea ya miembro.
- `listMembers`, `removeMember` (solo admin; un admin no puede
  autoeliminarse por esta via, evita dejar el grupo sin admin implicito;
  gestion completa de "abandonar grupo" queda fuera de alcance de esta
  fase, se revisara si se pide explicitamente).

### Servicio de subgrupos (`src/lib/groups/subgroup-service.ts`)

- `createSubgroup` — transaccion con bloqueo de fila del grupo, valida
  `maxSubgroups` (32) y nombre unico por grupo (constraint
  `subgroups_group_name_unique` ya existente desde Fase 0); el creador se
  anade automaticamente como miembro del subgrupo.
- Cualquier miembro del grupo puede crear subgrupos y anadir a otros
  miembros del grupo (no externos) a un subgrupo — decision de diseno
  documentada aqui: el enunciado solo definia roles a nivel de grupo, no
  restricciones de creacion de subgrupos.
- `removeSubgroupMember` — un usuario puede eliminarse a si mismo del
  subgrupo; solo el admin del grupo puede eliminar a otros.

### Rutas API (todas con `runtime = "nodejs"`, protegidas con `requireSession`)

- `POST /api/groups`, `GET /api/groups` — crear / listar grupos propios.
- `POST /api/groups/join` — unirse via codigo de invitacion.
- `GET /api/groups/[groupId]`, `PATCH /api/groups/[groupId]` — detalle /
  renombrar (admin).
- `GET /api/groups/[groupId]/members`,
  `DELETE /api/groups/[groupId]/members/[userId]` — listar / expulsar (admin).
- `GET /api/groups/[groupId]/subgroups`,
  `POST /api/groups/[groupId]/subgroups` — listar / crear subgrupo.
- `GET|POST /api/groups/[groupId]/subgroups/[subgroupId]/members`,
  `DELETE .../members/[userId]` — gestion de miembros de subgrupo.

Todas usan el patron `params: Promise<{...}>` (API dinamica async de
Next.js 15+/16) y devuelven errores via `errorResponse()` que traduce
`AppError` a JSON + status code consistente.

### UI minima

- `/groups` (server component + `groups-client.tsx`): listar grupos
  propios, formulario crear grupo, formulario unirse por codigo.
- `/groups/[groupId]` (server component + `group-detail-client.tsx`):
  detalle, contadores, lista de miembros (boton eliminar si eres admin),
  lista y creacion de subgrupos.
- Ambas paginas server-side redirigen a `/login` si no hay sesion
  (`getSession()`), siguiendo el patron ya usado en `/`.

### Pendiente / bloqueos que persisten

- `pnpm install` sigue bloqueado en este entorno de desarrollo; nada de lo
  anterior se ha compilado ni ejecutado en runtime real. Nuevas
  dependencias anadidas en esta fase: `ws@^8.21.1`, `bufferutil@^4.1.0`
  (runtime) y `@types/ws@^8.18.1` (dev) — todas verificadas contra el
  registro de npm.
- No se implemento "abandonar grupo" (un miembro saliendo voluntariamente)
  ni transferencia de rol admin; no estaba en el alcance explicito de esta
  fase y anadiria complejidad (grupo sin admin). Se puede pedir como mejora
  futura.
- La auditoria de estas operaciones (quien creo/renombro/elimino que) se
  implementara en Fase 5 tal como estaba planificado; los servicios estan
  escritos de forma que sera facil anadir un `tx.insert(auditLogs)` dentro
  de las mismas transacciones existentes.

## Incidencias detectadas al ejecutar por primera vez (post Fase 2)

Primera vez que se ejecuta `pnpm dev` en un entorno real (fuera del sandbox
de desarrollo, donde pnpm estaba bloqueado). Encontrado y corregido:

1. **`drizzle-kit` no carga `.env.local`** (esa es una convencion propia de
   Next.js, no de drizzle-kit). Solucion: `drizzle.config.ts` ahora carga
   `.env.local` y `.env` explicitamente via el paquete `dotenv` (anadido
   como devDependency).
2. **`next.config.ts` usaba `experimental.typedRoutes`**, que en Next.js 16
   se movio a la raiz de la config (`typedRoutes`, ya no experimental).
3. **TypeScript 7.0.2 no expone la Compiler API que Next.js usa por
   defecto** (TS7 es el nuevo compilador nativo con una API distinta).
   Next.js detecta esto y lanza `Unhandled Rejection` al arrancar. Solucion:
   `experimental.useTypeScriptCli: true` en `next.config.ts`, que indica a
   Next.js que invoque el CLI de `tsc` en lugar de la Compiler API interna.

Estado tras estas correcciones: pendiente de confirmacion del usuario tras
volver a ejecutar `pnpm dev`.

## Como verificar que el proyecto funciona (sin usar el navegador)

```bash
pnpm dev
# en otra terminal, con el servidor corriendo:
curl -i http://localhost:3000/api/health   # debe devolver 200 + JSON {status:"ok",...}
curl -i http://localhost:3000/             # debe devolver 200 + HTML
```

Si `curl` no esta disponible, usar `node -e "fetch('http://localhost:3000/api/health').then(r=>r.text()).then(console.log)"`.
Si el arranque de `pnpm dev` no llega a imprimir `✓ Ready`, el error de
arranque aparece completo en esa misma terminal (no hace falta el
navegador para diagnosticarlo).



## Fase 2.5 — Sistema de diseno (UI/UX) con TailwindCSS (completada)

Ver `design-system.md` para el detalle completo (tokens, tabla de
contraste WCAG con las 22 combinaciones verificadas, catalogo de
componentes). Resumen de decisiones clave:

- **Tailwind CSS v4.3.3** (no v3): version real vigente en el registro de
  npm; v3 esta en mantenimiento. v4 cambia el flujo de configuracion por
  completo (CSS-first via `@theme`, sin `tailwind.config.ts`, sin
  `autoprefixer` separado — todo integrado en `@tailwindcss/postcss` con
  Lightning CSS). Documentado en detalle en `design-system.md` el porque
  de la desviacion respecto al flujo v3 pedido literalmente.
- **shadcn/ui** como base de componentes: patron "copiar codigo tipado",
  no dependencia opaca. Construido a mano (sin ejecutar el CLI `shadcn
  init`, que requiere red+pnpm) sobre primitivos reales
  `@radix-ui/react-*` para accesibilidad ARIA correcta de fabrica.
- **next-themes** para tema claro/oscuro/sistema, persistencia en
  localStorage automatica, `prefers-color-scheme` respetado por defecto.
  Selector visible (`ThemeToggle`) en el header de todas las paginas.
- **Paleta verificada matematicamente**: `scripts/check-contrast.mjs`
  implementa la formula oficial de luminancia relativa WCAG 2.1 (sin
  dependencias externas) y confirma que las 22 combinaciones
  fondo/texto usadas cumplen AA (14 de ellas AAA). El primer intento de
  color de borde interactivo fallo (1.48:1 / 1.86:1) y se corrigio a
  `#64748b`, reverificado antes de usarse — proceso de iteracion
  documentado en `design-system.md`.
- **Componentes creados** en `src/components/ui/`: Button, Input, Label,
  Select, Card, Dialog, Badge, Avatar, Switch, DropdownMenu, Table,
  Skeleton, Toaster (sonner). Todos tipados, con variantes via
  `class-variance-authority`, accesibles por teclado y con foco visible.
- **Pantallas migradas**: `layout.tsx` (ThemeProvider + Toaster),
  `register`/`login`/`recover` (Card + Input + Label + Button), `groups`
  y `groups/[groupId]` (Card, Table, Badge, Avatar, Skeleton, toasts de
  `sonner` en vez de errores inline). Nuevo `SiteHeader` compartido
  (logo, nav, ThemeToggle, sesion/logout) usado en layouts `(auth)` y
  `(app)`.
- **Lighthouse/axe-core**: NO ejecutado (requiere `pnpm build`/`pnpm
  start` + navegador, no disponibles en este entorno). Instrucciones
  exactas para ejecutarlo dejadas en `design-system.md`; pendiente de
  verificacion real por el usuario.

## Proximos pasos (Fase 3 — Gastos y repartos)

- Modelo `expenses` / `expense_shares` ya definido en el esquema (Fase 0)
  con patron Strategy via enum `split_method` (`equal`/`percentage`/`fixed`).
- Implementar validacion de que la suma de `expense_shares.share_amount`
  coincide exactamente con `expenses.amount` (aritmetica decimal exacta,
  cuidado con redondeos — usar centimos enteros internamente o `Decimal`).
- Rate limiting configurable (1 gasto cada 30s por usuario) leyendo
  `app_config` con fallback a `env.RATE_LIMIT_EXPENSE_CREATION_SECONDS`.
- Reutilizar `requireMembership`/`requireGroupAdmin` de Fase 2 para
  autorizacion; usar `db.transaction` (ya disponible con neon-serverless)
  para crear expense+shares atomicamente.
- Usar los componentes ya creados en Fase 2.5 (`Select` para
  moneda/metodo de reparto, `Table` para el listado de gastos, `Dialog`
  para el formulario de alta) en vez de crear estilos nuevos.
