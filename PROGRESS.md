# PROGRESS.md — Gatso (control de gastos compartidos)

> Memoria persistente del proyecto. Leer este fichero al inicio de cada fase
> en vez de recorrer el codigo completo. Se actualiza al cierre de cada fase.

## Estado actual

**Fase completada: Fase 5 — Auditoria inmutable.**
Pendiente confirmacion del usuario para iniciar Fase 6 (Gestion de monedas).

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

## Fase 3 — Gastos y repartos (completada)

### Aritmetica de dinero: centimos enteros, no coma flotante

`src/lib/money.ts` implementa toda la aritmetica de repartos en **centimos
enteros** (`number`, seguro para estos importes) en vez de decimales en
coma flotante — `0.1 + 0.2 !== 0.3` en JS, y un error de redondeo en un
reparto de gastos es un bug de integridad de datos, no un detalle
cosmetico. Funciones: `parseAmountToCents`/`centsToAmount` (conversion
string↔centimos), `parsePercentageToBasisPoints` (porcentaje↔puntos base
enteros sobre 10000), `distributeEqually` (reparto igualitario asignando
el resto de centimos a las primeras posiciones), `distributeByBasisPoints`
(metodo del **resto mayor / Hamilton** para repartir por porcentajes sin
perder ni anadir centimos), `assertExactSum` (valida que un reparto por
importes fijos sume exactamente el total). Todo cubierto por tests reales
en `src/lib/money.test.ts` (Vitest).

### Patron Strategy real para metodos de reparto

`src/lib/expenses/split-strategies.ts` implementa el patron Strategy
pedido explicitamente: un `Record<SplitInput["method"], SplitStrategy>`
mapea cada metodo (`equal`/`percentage`/`fixed`) a su funcion de calculo,
todas con la misma firma `(totalCents, split) => ComputedShare[]`. Anadir
un metodo nuevo en el futuro (ej. "por consumo/unidades") solo requiere
escribir una funcion nueva y registrarla en el mapa — no toca el modelo de
datos (`expenses`/`expense_shares` ya son agnosticos al metodo, definidos
en Fase 0) ni las rutas API. `computeShares()` ademas verifica que ningun
usuario aparezca dos veces en el mismo reparto. Tests en
`split-strategies.test.ts`.

### Validacion (Zod v4) — discriminated union por metodo

`src/lib/validation/expenses.ts` usa `z.discriminatedUnion("method", [...])`
sobre el campo `method` para validar la forma exacta de cada tipo de
reparto (verificado contra la documentacion oficial de Zod: la API es
identica en v4, con anadidos como composicion de discriminated unions).
Regex de formato para importes (`AMOUNT_REGEX`) y porcentajes
(`PERCENTAGE_REGEX`); refinamiento adicional para exigir importe total
`> 0`. Nota de deuda tecnica menor: se sigue usando `z.string().uuid()`
(metodo encadenado) por consistencia con el resto del codebase (Fases 1/2);
Zod v4 lo marca **deprecado** en favor de `z.uuid()` top-level pero
**sigue funcionando** (se eliminara en la siguiente major, no en v4). No
bloqueante; se puede migrar en un pase de limpieza futuro.

### Servicio de gastos (`src/lib/expenses/service.ts`)

- `createExpense`: verifica membresia del actor, moneda activa, subgrupo
  (si aplica) y que el pagador sea miembro; valida que **todos** los
  participantes del reparto sean miembros del grupo (y del subgrupo, si el
  gasto esta scoped a uno) via `assertParticipantsBelongToScope`; calcula
  los repartos con `computeShares` **antes** de abrir la transaccion
  (evita trabajo de BD si la validacion de negocio falla); dentro de la
  transaccion (`db.transaction`, soportada gracias al driver
  `neon-serverless` elegido en Fase 2) aplica el rate limit y crea
  `expenses` + `expense_shares` atomicamente.
- `listExpenses`, `getExpenseDetail`, `deleteExpense` (regla de permisos
  de Fase 4 adelantada aqui porque es inseparable de la propia entidad:
  solo el creador del gasto o el admin del grupo pueden borrarlo).

### Rate limiting configurable (`src/lib/expenses/rate-limit.ts`)

Limite global (no por grupo) de 1 gasto cada N segundos por usuario.
`getExpenseCreationRateLimitSeconds()` lee la clave
`expense_creation_rate_limit_seconds` de la tabla `app_config` (ajustable
en runtime sin redeploy, ej. via `drizzle-kit studio` o SQL directo) con
fallback a `env.RATE_LIMIT_EXPENSE_CREATION_SECONDS` (por defecto 30s) si
no hay fila o el valor no es un numero positivo valido. La comprobacion
ocurre **dentro** de la misma transaccion de creacion del gasto para
minimizar la ventana de doble envio.

### Monedas (adelanto minimo de Fase 6)

`src/lib/currencies/service.ts`: `listActiveCurrencies` y
`requireActiveCurrency` (usado por `createExpense` para rechazar monedas
no soportadas/inactivas). La gestion completa del catalogo (alta,
limite de 16 monedas activas) es objeto de Fase 6; aqui solo lo minimo
necesario para que un gasto pueda validar su moneda.

### Seed de monedas iniciales

`src/db/seed.ts` (`pnpm db:seed`, ejecutado con `tsx`) inserta EUR y USD
en la tabla `currencies` si no existen ya (idempotente). Verificado que
`tsx` resuelve automaticamente los path aliases de `tsconfig.json`
(`@/*`) via `get-tsconfig`/`resolvePathAlias` internamente (confirmado
inspeccionando el codigo fuente publicado de `privatenumber/tsx`), asi
que el script puede importar `./index` (que a su vez usa `@/lib/env`)
sin configuracion adicional. El script carga `.env.local`/`.env`
explicitamente con `dotenv` antes del import (mismo patron que
`drizzle.config.ts` de Fase 1) para garantizar que `DATABASE_URL` este
disponible cuando se evalua `src/lib/env.ts`.

### Rutas API (todas `runtime = "nodejs"`, protegidas con `requireSession`)

- `GET|POST /api/groups/[groupId]/expenses` — listar (con filtro opcional
  `?subgroupId=`) / crear.
- `GET|DELETE /api/groups/[groupId]/expenses/[expenseId]` — detalle
  (incluye repartos por usuario) / borrar.
- `GET /api/currencies` — catalogo de monedas activas (usado por el
  selector de moneda en el formulario de alta).

### UI (usa el sistema de diseno de Fase 2.5, no estilos nuevos)

- `src/app/(app)/groups/[groupId]/expense-form-dialog.tsx`: `Dialog` con
  formulario completo — importe, moneda (`Select` poblado desde
  `/api/currencies`), descripcion, fecha, pagador, subgrupo opcional,
  metodo de reparto (`Select`) y una fila por miembro con `Switch`
  "incluir" + campo de porcentaje/importe segun el metodo elegido.
- `group-detail-client.tsx` ampliado con una tarjeta "Gastos": tabla
  (`Table`) con fecha/descripcion/pagador/metodo (`Badge`)/importe y
  boton "Borrar" visible solo si el usuario puede borrar ese gasto
  (creador o admin del grupo — regla de Fase 4 aplicada ya en el
  servicio y reflejada aqui).

### Testing (adelanto de Fase 9 para la logica mas critica)

Se anadio `vitest.config.ts` (no existia) con el plugin
`vite-tsconfig-paths` para que los tests resuelvan el alias `@/*` sin
duplicar configuracion; nuevas dependencias `vite`, `vite-tsconfig-paths`
(dev). Tests reales (no ficticios) cubriendo la logica de dinero y de
repartos: `src/lib/money.test.ts`, `src/lib/expenses/split-strategies.test.ts`.
Ejecutar con `pnpm test`. Estos tests son puros (no tocan la base de
datos), por lo que corren sin `DATABASE_URL` configurado.

### Pendiente / bloqueos que persisten

- Sigue sin poder ejecutarse `pnpm install`/`pnpm build`/`pnpm test` en
  el entorno de desarrollo original (pnpm bloqueado); el usuario ha
  confirmado en la conversacion que `pnpm build` funciona ya en su
  maquina tras corregir los errores de tipos de Fase 2.5 — se recomienda
  ejecutar `pnpm test` tras `pnpm install` para verificar los tests
  nuevos de esta fase antes de continuar.
- No se implemento un endpoint para editar/actualizar un gasto existente
  (solo crear/listar/detalle/borrar) — no estaba en el alcance explicito
  de esta fase; se puede anadir como mejora futura reutilizando
  `computeShares` y `assertParticipantsBelongToScope`.
- No se implemento vista de "balances" (quien debe a quien) — el
  enunciado de Fase 3 pedia el alta de gastos y los metodos de reparto,
  no un calculo de liquidacion; se puede abordar en una fase posterior si
  se solicita explicitamente.

## Fase 4 (adelanto) — Edicion de gastos, validacion, historial y perfiles

Funcionalidad pedida explicitamente por el usuario fuera de orden de fase,
implementada completa (esquema + servicio + rutas + UI):

- **Edicion de gastos** (`updateExpense` en `src/lib/expenses/service.ts`,
  `PATCH /api/groups/[groupId]/expenses/[expenseId]`): permitido para quien
  creo el gasto o el administrador del grupo (misma regla que borrar).
  - Si edita el propio creador: `expenses.status` pasa a `"modified"`
    (puramente informativo).
  - Si edita otro usuario (admin del grupo editando un gasto ajeno):
    `expenses.status` pasa a `"pending_validation"` y se crea una
    `notification` para el creador original.
- **Validacion** (`validateExpense`,
  `POST /api/groups/[groupId]/expenses/[expenseId]/validate`): solo el
  creador original puede validar un gasto en `pending_validation`; al
  validar vuelve a `"confirmed"` y se resuelven (marcan leidas) las
  notificaciones asociadas a ese gasto.
- **Nuevo enum `expense_status`** (`confirmed | modified | pending_validation`)
  y columna `expenses.last_edited_by` (migracion `drizzle/0000_swift_redwing.sql`,
  generada y aplicada contra la Neon DB de `.env.local`).
- **Historial de cambios**: se reutiliza la tabla `audit_logs` (ya existente
  desde Fase 0, pensada para Fase 5) en vez de crear una tabla nueva:
  `createExpense`/`updateExpense`/`validateExpense`/`deleteExpense` insertan
  una fila (`action` create/update/delete, `beforeData`/`afterData` jsonb)
  dentro de la misma transaccion. Expuesto via
  `GET /api/groups/[groupId]/expenses/[expenseId]/history` y visible en la
  UI con `ExpenseHistoryDialog` (boton "Historial" en cada fila de gasto).
- **Notificaciones**: tabla nueva `notifications` (`src/db/schema/notifications.ts`)
  + `src/lib/notifications/service.ts` (crear, listar, marcar
  leida/leidas). Rutas `GET/PATCH /api/notifications` y
  `PATCH /api/notifications/[notificationId]`. UI: `NotificationsBell` en
  `SiteHeader`, con contador de no leidas y enlace al grupo del gasto.
- **Perfil de usuario (solo lectura)**: `src/lib/users/service.ts`
  (`getPublicProfile`, expone solo `alias`+`createdAt`, nunca hashes ni
  datos sensibles), ruta `GET /api/users/[userId]`, pagina
  `/users/[userId]` (`(app)/users/[userId]/`). Todos los alias clicables
  (miembros del grupo, pagador de un gasto, alias propio en el header)
  enlazan a este perfil.
- **UI de edicion**: `ExpenseFormDialog` ahora sirve para crear y editar
  (prop `editExpenseId`); en modo edicion carga el detalle (incluye
  repartos) al abrir el dialogo y hace `PATCH` en vez de `POST`. Tabla de
  gastos ampliada con columna "Estado" (badge `confirmed`/`modified`/
  `pending_validation`) y botones "Editar"/"Validar" (segun permisos)/
  "Historial".
- Build (`next build`) y tests (`vitest run`, 18/18) verificados en este
  entorno tras los cambios; typecheck (`tsc --noEmit`) limpio.

## Fase 4 (adelanto 2) — Alias unico race-safe, invitaciones personales y graficas

- **Alias unico frente a condiciones de carrera**: `src/lib/users/service.ts`
  (`createUserWithAlias`) comprueba disponibilidad antes de insertar (mensaje
  rapido) y ademas captura la violacion real del `UNIQUE` de `users.alias`
  (`isUniqueViolation`, SQLSTATE 23505) devolviendo 409 en vez de un 500 sin
  controlar si dos registros con el mismo alias llegan en paralelo.
  Reutilizada por `POST /api/auth/register` y por la aceptacion de
  invitaciones (mismo codigo, sin duplicar logica de hash/codigo de
  recuperacion).
- **Invitaciones personales a grupo** (`src/db/schema/group-invitations.ts`,
  tabla `group_invitations`, migracion `drizzle/0001_spicy_mathemanic.sql`):
  distintas del `invite_code` publico del grupo (reutilizable, sin
  caducidad). Un enlace de invitacion (`src/lib/groups/invitation-service.ts`):
  - Lo genera cualquier miembro del grupo (`POST
    /api/groups/[groupId]/invitations`), token aleatorio de 32 caracteres
    (nanoid), caduca a las 24h (`INVITATION_TTL_MS`).
  - Es de un solo uso: `acceptGroupInvitation` bloquea la fila con
    `for("update")` dentro de una transaccion para que no pueda consumirse
    dos veces en paralelo; verifica caducidad/uso previo/limite de
    miembros del grupo antes de crear el usuario.
  - Pagina publica `/invite/[token]` (sin sesion previa, bajo el grupo de
    rutas `(auth)`): muestra el nombre del grupo y un formulario de
    alias+contrasena; al aceptar crea la cuenta, une al grupo y abre
    sesion automaticamente (misma UX que `/register`).
  - UI: boton "Invitar" en la tarjeta "Miembros" de cada grupo
    (`invite-member-dialog.tsx`), lista enlaces pendientes/caducados y
    copia la URL al portapapeles.
- **Navegacion a subgrupos**: los badges de subgrupo en la pagina de grupo
  ahora enlazan a `/groups/[groupId]/subgroups/[subgroupId]`, una pagina
  propia con sus miembros, sus gastos (filtrados por `subgroupId`, mismas
  acciones editar/validar/borrar/historial que a nivel de grupo) y sus
  graficas. Nueva ruta `GET /api/groups/[groupId]/subgroups/[subgroupId]`
  (`getSubgroupDetail`, subgrupo + miembros con alias).
  `ExpenseFormDialog` gano la prop `lockedSubgroupId` para crear/editar un
  gasto ya fijado a ese subgrupo (oculta el selector).
- **Graficas de gastos** (`recharts@3.10.1`, anadido como dependencia
  nueva): `src/lib/expenses/service.ts` (`getExpenseStats`) agrega, por
  cada moneda presente en el ambito (grupo completo o un subgrupo), cuanto
  ha pagado cada miembro y cuanto le corresponde segun el reparto (en
  centimos enteros, mismo criterio anti-coma-flotante que el resto del
  proyecto). Expuesto en `GET /api/groups/[groupId]/expenses/stats`
  (parametro opcional `?subgroupId=`) y renderizado con
  `src/components/expense-stats-charts.tsx` (barras de "pagado por
  miembro" + tarta de "reparto por miembro"), integrado tanto en la vista
  de grupo como en la de subgrupo. Las monedas se muestran en graficas
  separadas para no sumar importes heterogeneos sin conversion.
- Build (`next build`), typecheck (`tsc --noEmit`) y tests (`vitest run`,
  18/18) verificados en este entorno tras los cambios.

## Bugfix — Un usuario nuevo no se anadia a los subgrupos existentes del grupo

`joinGroupByInviteCode` y `acceptGroupInvitation` creaban la membresia de
grupo pero nunca insertaban filas en `subgroup_memberships`: un miembro
nuevo (por codigo de invitacion o por invitacion personal) quedaba fuera de
todos los subgrupos ya existentes del grupo, por diseno todo miembro de un
grupo pertenece automaticamente a todos sus subgrupos (los subgrupos son un
filtro de gastos, no un mecanismo de exclusion de acceso).

- Nuevo helper `addUserToAllGroupSubgroups(tx, groupId, userId)` en
  `src/lib/groups/subgroup-service.ts` (inserta en `subgroup_memberships`
  para todos los subgrupos del grupo, `onConflictDoNothing()` por
  idempotencia); llamado dentro de la misma transaccion en
  `joinGroupByInviteCode` (`src/lib/groups/service.ts`) y en
  `acceptGroupInvitation` (`src/lib/groups/invitation-service.ts`).
- Backfill puntual ejecutado contra la BD de Neon para corregir el dato ya
  inconsistente (miembros existentes que se habian unido antes del fix):
  `insert into subgroup_memberships select ... from subgroups join
  memberships ... on conflict do nothing` (1 fila corregida en este
  entorno).
- Verificado con `tsc --noEmit`, `vitest run` (18/18) y `next build`.

## Fase 4 — Seguridad y permisos (completada)

### Auditoria sistematica de autorizacion en todas las rutas API

Se reviso **cada** `route.ts` bajo `src/app/api/` (uno a uno, junto con el
servicio que invoca) confirmando el patron: `requireSession()` → servicio
que llama `requireMembership`/`requireGroupAdmin` → condiciones SQL
`WHERE` que encadenan el recurso con su padre (`groupId`/`subgroupId`).
Resultado de la auditoria: **no se encontro ningun IDOR explotable** —
cuando un `groupId`/`subgroupId`/`expenseId`/`userId` no coinciden
realmente entre si, las consultas fallan de forma segura (404/403) en vez
de filtrar o mutar datos de otro grupo. Casos concretos verificados:
`removeMember` bloquea auto-eliminacion; `addSubgroupMember` comprueba que
el subgrupo pertenece al grupo Y que el usuario destino ya es miembro del
grupo; `validateExpense` exige ser el creador original del gasto;
`updateExpense`/`deleteExpense` usan la misma regla (creador o admin) de
forma consistente. Se identificaron y corrigieron dos puntos de mejora
(ver abajo): perfil publico sin relacion y falta de rate limiting en
autenticacion.

### Rate limiting en login y recuperacion de cuenta (mitigacion de fuerza bruta)

Hasta ahora solo la creacion de gastos tenia rate limiting; login y
`/api/auth/recover` no tenian ninguno, permitiendo probar contrasenas o
codigos de recuperacion sin limite. Nueva tabla `auth_attempts`
(`src/db/schema/auth-attempts.ts`, migracion
`drizzle/0002_elite_misty_knight.sql`) + `src/lib/auth/auth-rate-limit.ts`:

- `enforceAuthRateLimit(alias, "login" | "recover")`: cuenta intentos
  fallidos recientes de ese alias (ventana configurable via `app_config`,
  15 min por defecto) y devuelve 429 si supera el limite (10 por
  defecto, tambien configurable via `app_config` sin redeploy, mismo
  patron que `expense_creation_rate_limit_seconds` de Fase 3).
- Se cuenta por **alias**, no por IP: esta app no almacena IPs en ninguna
  tabla por diseno de privacidad (Fase 1), asi que limitar por IP
  penalizaria a usuarios legitimos detras del mismo NAT y romperia esa
  decision de diseno.
- Se registra un intento fallido **tanto si el alias no existe como si
  la contrasena/codigo es incorrecto** (login/recover), para no crear un
  canal lateral donde la ausencia de 429 revele que un alias no existe.
- Login y recover se mantienen accion-independientes (columna `action`)
  para que agotar el limite de uno no bloquee el otro.

### Perfil publico restringido a relacion real (antes: enumeracion abierta)

`GET /api/users/[userId]` permitia a cualquier usuario autenticado
consultar el alias/fecha de alta de **cualquier** UUID de usuario, sin
relacion alguna con el (enumeracion de usuarios). `getPublicProfile`
(`src/lib/users/service.ts`) ahora exige que el solicitante sea el propio
usuario **o** comparta al menos un grupo con el usuario objetivo (self-join
sobre `memberships` via `alias()` de `drizzle-orm/pg-core`); si no hay
relacion, se devuelve el mismo error 404 que si el usuario no existiera,
para no distinguir "existe pero no lo conoces" de "no existe". Esto no
rompe la funcionalidad pedida (ver el perfil de miembros de tus grupos
pinchando su alias) porque esa es exactamente la relacion permitida.

### Defensa en profundidad en el historial de gastos

`getExpenseHistory` confiaba unicamente en el `group_id` grabado en cada
fila de `audit_logs` para filtrar el historial por grupo (ya era seguro en
la practica, `expenses.groupId` es inmutable). Ahora, si el gasto todavia
existe, se verifica **explicitamente** que su `groupId` actual coincide
con el del path antes de devolver el historial, para no depender
implicitamente de que el audit log se siga escribiendo siempre igual en
el futuro.

### Cabeceras de seguridad HTTP

`next.config.ts` anade `headers()` global con `X-Content-Type-Options:
nosniff`, `X-Frame-Options: DENY` (mitiga clickjacking), `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` restrictiva
(camara/microfono/geolocalizacion desactivados) y
`X-DNS-Prefetch-Control: off`. No se fija HSTS explicitamente porque
Vercel ya la anade automaticamente en produccion sobre HTTPS.

### Revision de la regla de permisos en edicion/borrado de gastos

Confirmado (sin cambios de codigo, ya estaba correcto desde el adelanto de
Fase 4 anterior): `updateExpense` y `deleteExpense` aplican exactamente la
misma regla de autorizacion (creador del gasto o administrador del grupo),
verificada a nivel de servicio (no solo frontend) en ambos casos.

### Pendiente / fuera de alcance de esta fase

- No se implemento un "leave group" (abandonar grupo voluntariamente) —
  gap funcional identificado en la auditoria, no de seguridad; sigue
  pendiente desde Fase 2, se puede abordar si se pide explicitamente.
- La politica de "cualquier miembro puede generar invitaciones / anadir
  miembros a subgrupos" (no solo el admin) se mantiene como decision de
  diseno explicita (documentada ya en Fases 2 y 4-adelanto), no se
  restringe a admin salvo que se solicite lo contrario.
- Verificado con `tsc --noEmit`, `vitest run` (18/18) y `next build` tras
  todos los cambios de esta fase.

## Proximos pasos (Fase 5 — Auditoria inmutable)

- `audit_logs` se usa activamente desde Fase 4 (historial de gastos) pero
  todavia no tiene la regla/trigger SQL que impida `UPDATE`/`DELETE` sobre
  la tabla (mencionado desde el diseno original en Fase 0, nunca
  implementado). Es el elemento pendiente mas directo de cara a Fase 5.

## Fase 5 — Auditoria inmutable (completada)

### Inmutabilidad real a nivel de base de datos (trigger SQL)

`audit_logs` ya se usaba desde Fase 4 para el historial de gastos, pero
nada impedia que una fila fuera modificada o borrada (ni por un bug futuro
en la app, ni por acceso directo a la base de datos). Migracion custom
`drizzle/0003_audit_logs_immutable.sql` (generada con
`drizzle-kit generate --custom`, ya que un trigger no es representable en
el esquema TypeScript de Drizzle):

- Funcion `prevent_audit_logs_mutation()` que lanza `RAISE EXCEPTION`.
- Trigger `audit_logs_prevent_update` (`BEFORE UPDATE`) y
  `audit_logs_prevent_delete` (`BEFORE DELETE`), ambos `FOR EACH ROW`.
- Verificado manualmente contra la base de datos real: tanto un `UPDATE`
  como un `DELETE` directos sobre una fila existente de `audit_logs`
  fallan con el mensaje del trigger, confirmando que la tabla es
  realmente append-only a nivel de Postgres, no solo por convencion en el
  codigo de la aplicacion.

### Auditoria extendida a todo el ciclo de vida del grupo (antes: solo gastos)

Hasta ahora `audit_logs` solo registraba create/update/delete de gastos.
Nuevo servicio compartido `src/lib/audit/service.ts`
(`recordAuditLog`/`getGroupAuditLog`), usado ahora tambien por:

- `src/lib/groups/service.ts`: `createGroup` (alta de grupo + membresia
  admin inicial), `updateGroupName` (con snapshot del nombre anterior),
  `joinGroupByInviteCode` (alta de membresia), `removeMember` (baja de
  membresia).
- `src/lib/groups/subgroup-service.ts`: `createSubgroup`,
  `addSubgroupMember`, `removeSubgroupMember`.
- `src/lib/groups/invitation-service.ts`: `acceptGroupInvitation` (alta de
  membresia al aceptar una invitacion personal).
- `src/lib/expenses/service.ts`: refactorizado para usar el mismo
  `recordAuditLog` compartido en vez de un helper local duplicado
  (`logExpenseChange` eliminado), mismo comportamiento que antes.

Todas las llamadas se hacen dentro de la misma transaccion que la
operacion auditada (siguiendo el patron ya usado en gastos desde Fase 4),
para que la accion y su registro de auditoria se confirmen o deshagan
juntos. `entityType` sigue siendo un `varchar(32)` libre (no un enum de
Postgres) para poder anadir nuevos tipos de entidad sin migrar el esquema;
valores actuales: `expense`, `group`, `subgroup`, `membership`,
`subgroup_membership`.

### Visor de auditoria por grupo (solo administradores)

- `GET /api/groups/[groupId]/audit-log` (`getGroupAuditLog`, restringido
  con `requireGroupAdmin`): historial completo del grupo (todas las
  entidades, no solo un gasto concreto como en
  `getExpenseHistory`/`ExpenseHistoryDialog`, que sigue existiendo sin
  cambios y disponible para cualquier miembro).
- UI: `GroupAuditLogCard` (`src/app/(app)/groups/[groupId]/group-audit-log-card.tsx`),
  nueva tarjeta "Auditoria" al final de la pagina de detalle de grupo,
  visible solo si `isAdmin`; describe cada entrada en lenguaje natural
  (quien, que accion, sobre que entidad, cuando).

### Pendiente / fuera de alcance de esta fase

- No se anadio auditoria de registro de usuario (`createUserWithAlias`)
  ni de creacion/uso de invitaciones (`createGroupInvitation`) — se
  considero que la creacion de membresia (ya auditada) es el evento
  relevante para el grupo; la creacion de cuenta en si es un evento de
  usuario sin `groupId` natural y se puede anadir despues si se pide.
- El visor de auditoria no tiene filtro por tipo de entidad ni paginacion
  (limite fijo de 100 filas mas recientes) — suficiente para el volumen
  esperado de un grupo, se puede ampliar si hace falta.
- Verificado con `tsc --noEmit`, `vitest run` (18/18) y `next build` tras
  todos los cambios; trigger de inmutabilidad verificado con
  UPDATE/DELETE de prueba directos contra la base de datos.

## Proximos pasos (Fase 6 — Gestion de monedas)

- Solo existe `GET /api/currencies` (listado de monedas activas). Falta
  alta/baja de monedas y el limite de 16 monedas activas mencionado en el
  diseno original (Fase 0) pero nunca implementado.
