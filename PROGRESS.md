# PROGRESS.md — Gatso (control de gastos compartidos)

> Memoria persistente del proyecto. Leer este fichero al inicio de cada fase
> en vez de recorrer el codigo completo. Se actualiza al cierre de cada fase.

## Estado actual

**Version actual: v0.8.0. Fase 11 — Importacion desde Splitwise completada
y ampliada con participantes provisionales reclamables.** La prioridad
media del backlog (paginacion por cursor, retencion/limpieza y rate
limiting adicional) tambien esta completada. Toda la "Funcionalidad de
producto pendiente" del backlog general tambien esta completada
(administradores de plataforma, auditoria global, politica de grupos con
cero miembros, contrasenas comunes y notificaciones push). El principal
pendiente tecnico son las pruebas de integracion/E2E con BD y navegador
reales.

Las secciones historicas de cada fase conservan el estado que tenian en ese
momento. Para conocer el trabajo vigente, consultar **Backlog aun pendiente**
al final del documento.

## Stack confirmado (versiones reales verificadas en npm registry, no supuestas)

- Node.js **24.x** (version fijada en `package.json` y usada en el entorno actual)
- TypeScript **7.0.2** (compilador nativo, `type: module`, estricto)
- Next.js **16.2.12** (App Router), React **19.2.8**
- Gestor de paquetes: **pnpm 11.17.0**, fijado en `packageManager` de `package.json`
- ORM: **Drizzle ORM** sobre **Neon serverless Postgres** (`@neondatabase/serverless`, WebSocket/Pool para transacciones interactivas)
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

## Fase 6 — Gestion de monedas (completada)

### Nuevo concepto: administrador de plataforma (distinto del admin de grupo)

El catalogo de monedas es global (no pertenece a ningun grupo), asi que
el rol `memberships.role = "admin"` (por grupo) no aplicaba. Se anadio
`users.is_platform_admin` (boolean, `false` por defecto,
`src/db/schema/users.ts`) + helper
`requirePlatformAdmin`/`isPlatformAdmin` (`src/lib/auth/platform-admin.ts`).
Deliberadamente **no hay ninguna UI para auto-asignarse este rol** (seria
un agujero de seguridad obvio): el primer administrador de plataforma se
activa con un `UPDATE users SET is_platform_admin = true WHERE alias =
'...'` manual contra la base de datos, mismo patron ya usado para ajustar
`RATE_LIMIT_EXPENSE_CREATION_SECONDS`/limites de auth via `app_config`. No
se guarda en el JWT de sesion (igual que el rol de grupo): se consulta en
BD en cada request, para que revocar el permiso surta efecto inmediato.

### Servicio de monedas ampliado (`src/lib/currencies/service.ts`)

- `MAX_ACTIVE_CURRENCIES = 16` (constante, decision de diseno original de
  Fase 0, nunca antes aplicada en codigo).
- `createCurrency(actingUserId, input)`: solo administradores de
  plataforma; se crea activa por defecto; rechaza con 409 si ya se ha
  alcanzado el limite de 16 activas o si el codigo ya existe
  (`isUniqueViolation`).
- `setCurrencyActive(actingUserId, code, isActive)`: activar respeta el
  mismo limite de 16; desactivar nunca falla por limite (una moneda
  desactivada no se borra ni afecta a gastos historicos que ya la usan,
  `expenses.currency_code` sigue siendo una referencia valida — solo deja
  de ofrecerse para gastos **nuevos**).
- `listAllCurrencies(actingUserId)`: catalogo completo (activas +
  inactivas), solo administradores; `listActiveCurrencies()` (sin cambios,
  usado por el formulario de creacion de gastos) sigue siendo publico para
  cualquier usuario autenticado.
- Create/activate/deactivate quedan auditados via el mismo
  `recordAuditLog` de Fase 5 (`entityType: "currency"`, `entityId` = codigo
  ISO 4217).

### Cambio de esquema: `audit_logs.entity_id` de `uuid` a `varchar(64)`

La columna `entity_id` de `audit_logs` era `uuid`, pero la PK de
`currencies` es su codigo ISO 4217 (`varchar(3)`, ej. "EUR"), no un UUID.
Se cambio el tipo de columna a `varchar(64)` (migracion
`drizzle/0004_omniscient_emma_frost.sql`, `ALTER COLUMN ... SET DATA TYPE`)
para poder auditar entidades cuya clave primaria no es un UUID, sin
acoplar el modelo de auditoria a esa suposicion de cara a fases futuras.

### Rutas API (todas `requireSession`, autorizacion via `requirePlatformAdmin` en el servicio)

- `GET /api/admin/currencies` — catalogo completo.
- `POST /api/admin/currencies` — crear moneda.
- `PATCH /api/admin/currencies/[code]` — activar/desactivar.
- `GET /api/admin/audit-log` — historial de auditoria de entidades sin
  `groupId` (de momento, solo monedas); `getPlatformAuditLog`
  (`src/lib/audit/service.ts`), distinto de `getGroupAuditLog` (Fase 5,
  filtra por `groupId`, restringido a admin de grupo).
- `GET /api/currencies` (Fase 3, sin cambios): sigue devolviendo solo
  monedas activas, para el selector del formulario de gastos.

### UI: `/admin/currencies` (solo administradores de plataforma)

- Pagina server component (`src/app/(app)/admin/currencies/page.tsx`):
  redirige a `/groups` si el usuario no es administrador de plataforma
  (comprobado en servidor, no solo ocultando el enlace).
- `AdminCurrenciesClient`: formulario de alta (codigo/nombre/simbolo/
  decimales) + tabla del catalogo completo con un `Switch` por fila para
  activar/desactivar, y un badge con el contador `activas / 16` (cambia a
  variante "warning" al llegar al limite).
- Enlace "Administracion" visible en `SiteHeader` solo si
  `session.isPlatformAdmin` (calculado en los layouts/paginas server-side
  que ya invocan `getSession()`, nunca en el cliente).

### Pendiente / fuera de alcance de esta fase

- No se anadio UI para gestionar el rol de administrador de plataforma en
  otros usuarios (alta/baja) — es deliberado, ver arriba; se puede anadir
  una pantalla especifica si se solicita explicitamente, con las mismas
  cautelas de seguridad.
- No se implemento borrado de monedas (solo desactivacion) — borrar
  romperia la integridad referencial con gastos historicos que ya la usan
  (`expenses.currency_code`); desactivar es la operacion correcta y
  suficiente para "retirar" una moneda del catalogo activo.
- Verificado con `tsc --noEmit` (tras limpiar `tsconfig.tsbuildinfo`,
  cache incremental que no habia detectado la nueva ruta
  `/admin/currencies` hasta el primer `next build`), `vitest run` (18/18)
  y `next build`.

## Fase 7 — PWA (completada)

### Iconos generados a partir del SVG existente (sin dependencia nueva en runtime)

Hasta ahora `public/icons/icon.svg` (= `src/app/icon.svg`, favicon via
convencion de fichero de Next.js) era el unico icono. El manifiesto de una
PWA instalable necesita PNG en tamanos concretos (Android exige, como
minimo, 192x192 y 512x512; iOS no soporta SVG para `apple-touch-icon`).
Se anadio `@resvg/resvg-js` como **devDependency** (binarios prebuilt, sin
compilacion nativa, mismo criterio que `argon2`/`ws` en fases anteriores;
verificado contra el registro de npm) y `scripts/generate-pwa-icons.mjs`
(`pnpm icons:generate`), que rasteriza el SVG fuente a:

- `public/icons/icon-192.png`, `public/icons/icon-512.png` (purpose `any`).
- `public/icons/icon-maskable-192.png`, `.../icon-maskable-512.png`
  (purpose `maskable`): el SVG fuente ya tiene el fondo a sangre completa
  sin margen transparente, por lo que el mismo diseno sirve igual de bien
  recortado a circulo/squircle en Android sin perder el logo.
- `src/app/apple-icon.png` (180x180): convencion de fichero de Next.js
  App Router, anade `<link rel="apple-touch-icon">` automaticamente sin
  tocar `layout.tsx`.

`@resvg/resvg-js` es solo una herramienta de build-time (genera ficheros
PNG estaticos versionados en el repo); no se importa desde ningun codigo
de la aplicacion ni afecta al bundle de produccion.

### Manifiesto web (convencion de fichero `src/app/manifest.ts`)

Verificado contra la documentacion oficial de Next.js (App Router, File
Conventions): al existir `src/app/manifest.ts` exportando un
`MetadataRoute.Manifest`, Next.js lo sirve en `/manifest.webmanifest` y
anade automaticamente `<link rel="manifest">` en el `<head>` de cada
pagina, sin necesidad de tocar `metadata` en `layout.tsx`. Contenido:
`name`/`short_name`/`description` en espanol, `display: "standalone"`,
`start_url`/`scope: "/"`, `background_color`/`theme_color` alineados con
los ya usados en `viewport.themeColor` (Fase 2.5), `lang: "es"` y el
array de `icons` (any + maskable) generado en el paso anterior. Tambien
se anadio `metadata.appleWebApp` (`capable: true`, `title: "Gatso"`) en
`layout.tsx` para que Safari/iOS trate la app como standalone al
anadirla a la pantalla de inicio (Next.js expone esta clave de metadata
como atajo de las meta tags `apple-mobile-web-app-*`, verificado en la
documentacion oficial de la API `Metadata`).

### Service worker manual (sin `next-pwa`/`serwist`)

No se anadio ningun paquete de terceros para PWA (no estaba entre las
dependencias del proyecto y estos paquetes suelen anadir un plugin de
webpack/Turbopack adicional que complica la configuracion ya existente
de `next.config.ts`, en concreto el manejo a medida de
`outputFileTracingIncludes` para `argon2` de la fase de despliegue). En
su lugar, `public/sw.js` es un service worker minimo escrito a mano:

- `install`: precachea un "app shell" pequeno (`/offline`, los dos
  iconos PNG principales, el manifiesto) en una cache con nombre
  versionado (`gatso-shell-v1`).
- `activate`: borra caches de versiones anteriores del propio SW.
- `fetch`: solo intercepta peticiones `GET` del mismo origen.
  - Peticiones a `/api/*` se ignoran explicitamente (siempre red, nunca
    cache): son datos dinamicos y sensibles (sesion, gastos, saldos) que
    nunca deben servirse obsoletos.
  - Navegaciones (`request.mode === "navigate"`): red primero; si falla
    (sin conexion), cae a lo que haya en cache para esa URL o, si no hay
    nada, a la pagina `/offline`.
  - Resto de peticiones GET (assets de `_next/static`, con hash
    inmutable en el nombre): cache-first con relleno de cache en segundo
    plano (stale-while-revalidate).
- `src/components/service-worker-register.tsx` (componente cliente sin
  salida visual, montado en `layout.tsx`) llama a
  `navigator.serviceWorker.register("/sw.js")` **solo si
  `NODE_ENV === "production"`**: en `next dev` el codigo se recompila
  constantemente y un service worker cacheando agresivamente estorbaria
  al ciclo de desarrollo (recomendacion estandar al implementar SW
  manuales, documentada tambien por Workbox).
- `src/app/offline/page.tsx`: pagina estatica minima ("Sin conexion",
  icono `WifiOff` de `lucide-react`) usada como fallback por el SW.
- `next.config.ts`: cabecera `Cache-Control: no-cache` anadida
  especificamente para `/sw.js` (ademas de las cabeceras de seguridad
  globales de Fase 4), para que el navegador revalide el propio fichero
  del service worker en cada carga y un despliegue nuevo no tarde en
  llegar a clientes con la PWA ya instalada.

### Pendiente / fuera de alcance de esta fase

- No se implemento sincronizacion en segundo plano (`Background Sync`)
  ni cola de peticiones offline (ej. crear un gasto sin conexion y
  reenviarlo al recuperarla) — el enunciado de la fase pedia
  instalabilidad + shell offline, no una app "offline-first" completa
  con escritura diferida; se puede abordar como mejora futura si se
  pide explicitamente (anadiria complejidad notable: cola persistente,
  resolucion de conflictos, reintentos).
- No se anadieron notificaciones push (`Push API`/`Notification API`);
  las notificaciones in-app ya existentes (Fase 4, `NotificationsBell`)
  siguen siendo solo dentro de la propia app, no push del sistema.
- Verificado con `tsc --noEmit`, `vitest run` (18/18) y `next build`
  (nuevas rutas estaticas `/manifest.webmanifest`, `/apple-icon.png` y
  `/offline` generadas correctamente). La instalabilidad real
  (banner "Instalar app" de Chrome/Edge, Lighthouse PWA audit) requiere
  servir la app sobre HTTPS (localhost cuenta como origen seguro para
  pruebas) y no se ha podido verificar en un navegador real desde este
  entorno; pendiente de confirmacion visual por el usuario tras
  desplegar o correr `pnpm build && pnpm start`.

## Preparacion para despliegue en Vercel (fuera de la numeracion de fases)

Ajustes necesarios para que el proyecto se despliegue correctamente en
Vercel, solicitados explicitamente por el usuario. Verificado contra la
documentacion oficial de Vercel (Node.js Runtimes) en el momento de
escribir esto, no supuesto:

- **`package.json` `engines.node` corregido de `>=26.0.0` a `24.x`**:
  Vercel actualmente solo ofrece **20.x/22.x/24.x** como runtime de
  Functions; Node 26.0.0 (released mayo 2026) no sera Active LTS hasta
  octubre 2026 y todavia no esta disponible como opcion en la plataforma.
  Un `engines.node` pidiendo un major no soportado no produce un error
  claro: Vercel puede ignorarlo silenciosamente y usar el valor de
  Project Settings en su lugar, lo que habria dejado el pin del proyecto
  sin efecto real. `24.x` coincide con Node ya instalado en este entorno
  de desarrollo (`v24.18.0`) y con el default actual de Vercel para
  proyectos nuevos; Next.js 16 solo exige Node >= 20.9, asi que no hay
  perdida funcional. Con `engine-strict=true` en `.npmrc`, se verifico que
  un mismatch de `engines.node` solo emite un WARN (no bloquea
  `pnpm install`), pero se corrige igualmente por claridad y porque
  Vercel si usa este campo para seleccionar el runtime real.
- **`next.config.ts`: `serverExternalPackages: ["argon2"]` +
  `outputFileTracingIncludes`** para las rutas de autenticacion
  (`/api/auth/**`, `/api/invitations/**`, las que usan `hashSecret`/
  `verifySecret` de Fase 1). `argon2` es un modulo nativo (binario
  `.node` compilado); aunque Next.js ya lo excluye del bundle de servidor
  por defecto, se declara explicitamente y se anade la inclusion forzada
  del binario prebuilding como red de seguridad frente a un problema
  documentado donde el rastreador de archivos de Vercel (`@vercel/nft`)
  no siempre detecta binarios nativos cargados de forma dinamica,
  causando `Error: No native build was found...` solo en produccion (no
  reproducible en local).
- **`pnpm-workspace.yaml` (`allowBuilds`) ya estaba correctamente
  configurado** desde que se anadio `recharts` en una fase anterior:
  verificado que la sintaxis (`allowBuilds:` como mapa, no
  `onlyBuiltDependencies:` como lista) es la correcta para pnpm 11.x (el
  formato cambio entre pnpm 10 y 11); confirmado que con `CI=true` (que
  Vercel fija automaticamente) `pnpm install --frozen-lockfile` no pide
  confirmacion interactiva y respeta el allowlist ya commiteado. No
  requirio cambios, solo verificacion.
- **`README.md` ampliado** con una guia de despliegue completa: tabla de
  variables de entorno necesarias (marcando que `NODE_ENV` **no** debe
  fijarse manualmente, Vercel la reserva), explicacion de por que las
  migraciones de base de datos deben ejecutarse manualmente contra la
  base de datos de produccion (`pnpm db:generate`/`pnpm db:migrate`) y
  nunca desde el propio `buildCommand` de Vercel (evita migrar en cada
  build de Preview contra la misma base de datos), y nota sobre elegir
  la region de Vercel Functions mas cercana a la region de la base de
  datos Neon si el plan lo permite.
- `.env.example`: comentario anadido a `NODE_ENV` recordando que no se
  fija manualmente en Vercel.
- Verificado end-to-end en este entorno: `tsc --noEmit` limpio,
  `vitest run` (18/18), `next build` exitoso (con las nuevas opciones de
  `next.config.ts` aplicadas sin error), y
  `CI=true pnpm install --frozen-lockfile` (simulacion exacta del paso de
  instalacion de Vercel) sin warnings ni errores tras el fix de
  `engines.node`.

### Pendiente (accion manual del usuario en Vercel, no automatizable desde aqui)

- Conectar el repositorio en Vercel y configurar las variables de entorno
  de la tabla anterior (`DATABASE_URL`, `AUTH_SECRET` como minimo).
- Ejecutar `pnpm db:migrate` contra la base de datos de produccion antes
  del primer despliegue (las migraciones ya existentes en `drizzle/`
  cubren todo el esquema hasta Fase 6 inclusive).
- Ejecutar `pnpm db:seed` contra produccion para las monedas iniciales
  (EUR, USD), y el `UPDATE` manual documentado en Fase 6 para activar el
  primer administrador de plataforma si se quiere gestionar monedas desde
  produccion.

## GitHub Actions: CI y migraciones (fuera de la numeracion de fases)

Dos workflows nuevos en `.github/workflows/`, solicitados explicitamente
por el usuario para poder ejecutar `pnpm db:migrate` sin depender de una
maquina local:

- **`ci.yml`**: en cada push a `main` y cada Pull Request, corre
  `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build` sobre
  `ubuntu-latest` con Node 24 (via `actions/setup-node`) y pnpm (via
  `pnpm/action-setup`, respeta la version fijada en
  `packageManager` de `package.json`). El paso de build usa un
  `DATABASE_URL`/`AUTH_SECRET` ficticios (`postgresql://ci:ci@...`, un
  secreto de relleno) — verificado localmente que `next build` no llega a
  conectarse a una base de datos real durante el build (ninguna pagina
  estatica importa `@/db`), solo `src/lib/env.ts` valida el *formato* con
  zod en tiempo de carga del modulo; por tanto el workflow no necesita
  ningun secret real para pasar en cualquier PR externo.
- **`db-migrate.yml`**: ejecuta `pnpm db:migrate` contra la base de datos
  de produccion (secret `DATABASE_URL`, entorno de GitHub
  `production`). Deliberadamente **no** se dispara en cada push a `main`
  sin condicion (las migraciones pueden ser destructivas): se dispara
  solo si el push a `main` modifica algo bajo `drizzle/**` (una migracion
  nueva generada con `pnpm db:generate`), o manualmente via
  `workflow_dispatch` con un campo de texto que exige escribir literalmente
  "migrate" como confirmacion (el job falla explicitamente si no coincide).
  Usa `environment: production` para poder anadir revisores obligatorios
  desde `Settings → Environments` sin cambiar el workflow.
- Verificado localmente (simulando el paso de build de CI) que
  `next build` con esas variables ficticias completa sin error las 21
  rutas existentes hasta la fecha.
- Pendiente de accion manual del usuario: crear el Environment
  `production` en GitHub y anadir el secret `DATABASE_URL` (mismo valor
  que en Vercel) para que `db-migrate.yml` pueda ejecutarse.

## Bugfix — Vercel rechazaba el despliegue por symlinks (`outputFileTracingIncludes`)

Primer despliegue real en Vercel fallido con: *"The framework produced an
invalid deployment package for a Serverless Function. Typically this
means that the framework produces files in symlinked directories."*

**Causa**: el `outputFileTracingIncludes` anadido en la preparacion del
despliegue (ver seccion anterior) usaba una ruta literal
`./node_modules/argon2/prebuilds/**/*`. Con pnpm, `node_modules/argon2`
**no es un directorio real**, es un symlink relativo hacia
`.pnpm/argon2@<version>/node_modules/argon2`. El glob resultante incluye
archivos cuyo directorio padre visible es ese symlink; el empaquetador de
funciones serverless de Vercel descarta (o rechaza el paquete completo)
cualquier archivo cuyo padre sea un symlink interno, precisamente para
evitar ZIPs invalidos — de ahi el error.

**Arreglo** (`next.config.ts`): en vez de la ruta literal, se resuelve la
ubicacion **real** en disco del paquete con
`dirname(require.resolve("argon2/package.json"))` (usando
`createRequire(import.meta.url)`, ya que `next.config.ts` se carga como
ESM). `require.resolve` sigue el symlink y devuelve la ruta ya dentro de
`.pnpm/`, por lo que el glob generado a partir de esa ruta nunca atraviesa
un symlink. Se eligio esta solucion (documentada como el fix quirurgico
recomendado, frente a `nodeLinker: hoisted` en pnpm o eliminar
`outputFileTracingIncludes` sin mas) porque mantiene el binario nativo de
`argon2` realmente incluido en el bundle de las rutas de autenticacion,
en vez de simplemente hacer desaparecer el error a costa de un fallo en
runtime (`Cannot find module`) al primer login/registro en produccion.

**Verificacion**: inspeccionado manualmente el `*.nft.json` generado por
`next build` para `/api/auth/login` — los archivos de `argon2`
(`argon2.cjs`, `package.json`, `prebuilds/**/*.node`, `node-gyp-build`,
`@phc/format`) aparecen todos referenciados via la ruta real
`.pnpm/argon2@0.45.1/node_modules/argon2/...`, no via el symlink
`node_modules/argon2` (que sigue apareciendo una vez, como referencia al
propio symlink — comportamiento normal y ya soportado por el tracer de
Next.js, no el patron que causaba el error). Typecheck, `vitest run`
(18/18) y `next build` verificados de nuevo tras el cambio.

## Fase 8 — Abandonar grupo (completada)

### Requisito y decision central: los gastos de quien abandona NUNCA se borran ni se ocultan

Pedido explicito del usuario: un miembro debe poder abandonar un grupo por
su cuenta, pero sus gastos (como pagador, creador o participante de un
reparto) deben seguir apareciendo tal cual al listar/crear/editar gastos,
marcados con un indicativo de que ha abandonado el grupo.

Esto ya era estructuralmente posible sin tocar el esquema: `expenses`
(`payerId`, `createdBy`) y `expense_shares` (`userId`) referencian
`users.id` directamente, nunca `memberships.id`; abandonar un grupo solo
borra la fila de `memberships` (y de `subgroup_memberships`), por lo que
ningun `ON DELETE CASCADE` afecta a los gastos. El "indicativo de que ha
abandonado el grupo" que pide el usuario se calcula, por tanto, en tiempo
de consulta: **la ausencia de una fila en `memberships` para
`(groupId, userId)` es la señal de "ha abandonado"**, sin necesidad de una
columna nueva ni de un estado a mantener sincronizado.

### Servicio: `leaveGroup` (`src/lib/groups/service.ts`)

Distinto de `removeMember` (Fase 2, expulsion por un administrador, que
explicitamente prohibe autoeliminarse): `leaveGroup(groupId, userId)`
permite la autoeliminacion voluntaria. Dentro de una transaccion, con las
filas de `memberships` del grupo bloqueadas (`.for("update")`, mismo
patron de concurrencia que `joinGroupByInviteCode`/`createSubgroup` desde
la Fase 2):

- Si quien abandona es el **unico administrador** y quedan otros
  miembros: asciende automaticamente al miembro restante con mas
  antiguedad (`pickAdminReplacement`, funcion pura extraida a
  `src/lib/groups/admin-replacement.ts` para poder testearla con Vitest
  sin necesidad de `DATABASE_URL`, siguiendo el mismo criterio ya usado en
  el repo para `money.ts`/`split-strategies.ts`). Garantiza que un grupo
  con miembros nunca se quede sin administrador.
- Si es el **ultimo miembro** del grupo: se permite abandonar igualmente;
  el grupo queda sin miembros pero **no se borra** (conserva su historial
  de gastos y auditoria intacto). Decision documentada como limite
  conocido: si alguien se une despues con el codigo de invitacion a un
  grupo vacio, entra como `member` (no se le asigna admin
  automaticamente); se puede revisar si se pide explicitamente.
- Elimina al usuario de todos los subgrupos del grupo
  (`removeUserFromAllGroupSubgroups`, nueva funcion mirror de
  `addUserToAllGroupSubgroups` en `src/lib/groups/subgroup-service.ts`):
  la pertenencia a un subgrupo no tiene sentido sin la pertenencia al
  grupo que lo contiene. **Bugfix de paso**: `removeMember` (expulsion por
  admin) tenia el mismo hueco desde la Fase 2 — nunca limpiaba
  `subgroup_memberships` al expulsar a alguien; se corrigio a la vez
  reutilizando la misma funcion.
- Registra en `audit_logs` (Fase 5) la baja de membresia con un flag
  `leftVoluntarily: true` en `beforeData` (mismo `entityType: "membership"`
  y `action: "delete"` que usa `removeMember`, para no anadir un tipo de
  entidad nuevo solo para distinguir el matiz) y, si hubo ascenso de
  administrador, una segunda entrada `action: "update"` con el antes/despues
  de esa membresia.

Nueva ruta `POST /api/groups/[groupId]/leave` (`requireSession`, mismo
patron que el resto de rutas de grupo).

### `src/lib/expenses/service.ts`: mostrar y seguir editando gastos de quien ya no es miembro

- `listExpenses`, `getExpenseDetail` y `getExpenseStats` hacen ahora un
  `LEFT JOIN`/consulta adicional contra `memberships` para calcular
  `payerHasLeftGroup` / `hasLeftGroup` (por reparto) / `hasLeftGroup` (por
  miembro en las estadisticas): `true` cuando no existe fila de membresia
  actual para ese usuario en el grupo. No se borra ni se reescribe ningun
  dato del gasto, solo se anade el indicativo calculado.
- `assertParticipantsBelongToScope` gana un parametro
  `grandfatheredUserIds`: al **editar** un gasto (`updateExpense`), el
  pagador y los participantes que YA estaban en ese gasto antes de la
  edicion quedan exentos de la comprobacion de membresia actual (se
  calculan a partir del `payerId`/`shares` cargados antes de aplicar los
  cambios). Sin esto, `updateExpense` habria roto el guardado de cualquier
  gasto en cuanto uno de sus participantes abandonara el grupo, ya que la
  validacion original exigia membresia vigente de *todos* los
  participantes del payload, viejos y nuevos. Los participantes
  **nuevos** anadidos en la edicion siguen exigiendo ser miembros
  actuales (no se puede anadir a alguien que ya no esta en el grupo).
  `createExpense` no cambia: un gasto nuevo solo puede repartirse entre
  miembros actuales.

### UI

- `ExpenseFormDialog` (`src/app/(app)/groups/[groupId]/expense-form-dialog.tsx`):
  en modo edicion, combina la lista de miembros actuales (`members`, prop)
  con cualquier pagador/participante del gasto cargado que ya no este en
  esa lista (`effectiveMembers`, marcados `hasLeftGroup: true`), para que
  el selector de pagador y las filas de reparto sigan mostrando a quien
  abandono el grupo (con el texto "(ha abandonado el grupo)") en vez de
  hacerlo desaparecer silenciosamente del formulario o dejar el selector
  en blanco.
- Tablas de gastos (`group-detail-client.tsx` y
  `subgroups/[subgroupId]/subgroup-detail-client.tsx`): badge "Ha
  abandonado el grupo" junto al alias del pagador cuando
  `payerHasLeftGroup` es `true`.
- Boton "Abandonar grupo" en la cabecera de `group-detail-client.tsx`
  (visible para cualquier miembro, incluido el admin — la logica de
  ascenso automatico en el servicio cubre ese caso), con confirmacion
  (`window.confirm`) y redireccion a `/groups` tras abandonar.
- `GroupAuditLogCard`: `describeEntry` distingue ahora "abandono el
  grupo" (borrado de membresia con `leftVoluntarily: true`) de "elimino
  miembro del grupo" (expulsion por un admin), y anade el caso de ascenso
  automatico a administrador.

### Pendiente / fuera de alcance de esta fase

- No se anadio UI para "abandonar subgrupo" de forma independiente (el
  servicio `removeSubgroupMember` ya soportaba autoeliminacion desde una
  fase anterior, pero sin botones en `subgroup-detail-client.tsx`); no
  formaba parte de lo pedido explicitamente en esta fase.
- Un grupo que queda con 0 miembros no se borra automaticamente ni se
  archiva; sigue existiendo con su codigo de invitacion activo. Se puede
  anadir una politica de limpieza si se pide explicitamente.
- Verificado con `tsc --noEmit`, `vitest run` (21/21, incluye los 3 tests
  nuevos de `pickAdminReplacement`) y `next build` (nueva ruta
  `/api/groups/[groupId]/leave` generada correctamente).

## Fase 9 — Balances y liquidacion (completada)

### Requisito y por que es un problema NP-dificil, no una simple resta

Pedido explicito del usuario: una vista de balances (quien debe a quien)
que **minimice el numero de transacciones** necesarias para saldar todas
las deudas de un grupo. Esto no es solo "cada deudor paga a cada
acreedor la parte proporcional": ese enfoque naive genera hasta
`deudores × acreedores` transacciones, mientras que casi siempre existe
una forma de liquidar el mismo conjunto de deudas con muchas menos
transacciones (en el caso extremo, un ciclo A→B→C→A de la misma cantidad
se liquida con **0** transacciones).

El problema exacto ("Optimal Account Balancing") es equivalente a
particionar el conjunto de balances netos en el minimo numero de
subconjuntos que suman cero y resolver cada subconjunto por separado, lo
cual esta emparentado con el problema de la suma de subconjuntos
(subset-sum) y es **NP-dificil** en el caso general: no existe un
algoritmo polinomico conocido que garantice el minimo absoluto para
cualquier numero de participantes. Verificado contra la discusion publica
y los tests conocidos del problema equivalente "LeetCode 465 - Optimal
Account Balancing" (usado tambien como base de los tests unitarios de
esta fase, ver mas abajo) para confirmar el comportamiento esperado del
algoritmo antes de escribir la implementacion propia.

### Estrategia hibrida (`src/lib/settlements/optimize.ts`)

Dado que un grupo puede tener hasta 64 miembros (limite de Fase 0/2), un
backtracking exhaustivo sobre todos los balances no es viable en el caso
general (complejidad factorial). Se combinan dos algoritmos segun el
numero de balances netos distintos de cero:

- **`minimizeExact`** (hasta `EXACT_THRESHOLD = 8` balances no nulos):
  backtracking con poda, variante directa del algoritmo de referencia
  para "Optimal Account Balancing". En cada paso fija el primer balance
  sin liquidar y prueba a saldarlo por completo contra cada balance de
  signo opuesto, recursando sobre el resto y podando cualquier rama que
  ya iguale o supere el mejor recuento de transacciones encontrado hasta
  el momento. Garantiza el **minimo absoluto** de transacciones.
- **`minimizeGreedy`** (mas de 8 balances no nulos): heuristica voraz que
  empareja repetidamente al mayor acreedor con el mayor deudor y liquida
  el importe menor de los dos. No garantiza el minimo absoluto en todos
  los casos (es un problema NP-dificil, no hay heuristica polinomica que
  lo garantice), pero corre en `O(n^2 log n)` y nunca genera mas de
  `n - 1` transacciones. Se eligio frente a intentar un backtracking con
  timeout porque un resultado determinista y acotado en tiempo es
  preferible a una respuesta HTTP con latencia variable o un timeout en
  produccion.
- El umbral de 8 es una decision documentada de compromiso: en la
  practica, la mayoria de grupos de gasto compartido tienen pocos
  balances pendientes distintos de cero en un momento dado (la mayoria de
  gastos ya se compensan entre si antes de llegar a la liquidacion), asi
  que el caso exacto cubre el uso real esperado; se puede revisar el
  umbral si se observan grupos grandes con muchos balances heterogeneos
  simultaneos.
- Validacion previa: `minimizeTransactions` exige que los balances no
  nulos sumen exactamente 0 (lo que unos deben, otros deben recibirlo);
  si no es asi hay un error de calculo previo en el agregado de gastos
  (no deberia ocurrir si los importes se calcularon con
  `src/lib/money.ts`, que garantiza sumas exactas sin perder centimos) y
  se lanza `AppError` en vez de devolver un resultado incorrecto en
  silencio.
- Tests (`src/lib/settlements/optimize.test.ts`, Vitest): incluyen los
  dos casos de ejemplo publicados del problema equivalente de LeetCode
  465 (verificados manualmente contra el resultado esperado documentado
  alli), casos triviales (0 y 1 transaccion), una comprobacion generica
  `assertSettles` que aplica las transacciones devueltas sobre los
  balances originales y confirma que todos quedan exactamente a cero (en
  vez de solo comparar el recuento), y una propiedad cruzada: el
  algoritmo exacto nunca genera *mas* transacciones que la heuristica
  voraz sobre el mismo conjunto de balances.

### Servicio (`src/lib/settlements/service.ts`)

`getGroupSettlement(groupId, userId, subgroupId?)` reutiliza el mismo
patron de agregacion que `getExpenseStats` (Fase 4-adelanto-2): por cada
moneda presente en el ambito (grupo completo o un subgrupo), calcula el
balance neto de cada usuario (`total pagado - total que le corresponde
segun los repartos`, en centimos enteros) y pasa los balances no nulos a
`minimizeTransactions`. Devuelve, por moneda, la lista de balances
ordenada (mayor acreedor primero) y la lista minima de transacciones con
alias resueltos.

- **Interaccion con Fase 8 (abandonar grupo)**: un usuario que abandono el
  grupo pero dejo un balance pendiente (pago de mas o de menos en gastos
  pasados) **sigue apareciendo en la liquidacion** — sus gastos
  historicos nunca se borran (Fase 8), asi que ignorar su balance
  ocultaria una deuda real. Cada balance/transaccion incluye
  `hasLeftGroup` (calculado igual que en `getExpenseStats`: ausencia de
  fila en `memberships`) para que la UI pueda avisar de que esa persona
  ya no es miembro actual sin dejar de mostrar lo que debe o le deben.
- Solo se listan monedas con al menos un balance pendiente (si todos los
  balances de una moneda son exactamente 0, esa moneda no aparece en la
  respuesta: no hay nada que liquidar).
- Nueva ruta `GET /api/groups/[groupId]/settlement` (parametro opcional
  `?subgroupId=`, mismo patron que `GET .../expenses/stats`).

### UI: `SettlementCard` (`src/components/settlement-card.tsx`)

Componente compartido (mismo patron que `ExpenseStatsCharts`) integrado
tanto en `group-detail-client.tsx` como en
`subgroups/[subgroupId]/subgroup-detail-client.tsx`, justo despues de la
tarjeta de Estadisticas: por cada moneda, lista los balances (badge verde
"le deben X" / rojo "debe X") y, si hace falta liquidar algo, la lista
minima de transacciones ("Alias A → Alias B: importe"), con el alias de
cada persona enlazando a su perfil (`/users/[userId]`) y un badge "Ha
abandonado el grupo" cuando corresponda. Es una vista **puramente
informativa**: no persiste que una transaccion se haya realizado de
verdad (ver limitaciones abajo).

### Pendiente / fuera de alcance de esta fase

- El umbral `EXACT_THRESHOLD = 8` para pasar del algoritmo exacto al
  voraz no se expone como configuracion (a diferencia de otros limites
  del proyecto via `app_config`): es un detalle de rendimiento interno,
  no una regla de negocio que un administrador deba poder ajustar.
- Verificado con `tsc --noEmit`, `vitest run` (29/29, incluye los 8 tests
  nuevos de `src/lib/settlements/optimize.test.ts`) y `next build` (nueva
  ruta `/api/groups/[groupId]/settlement` generada correctamente).

### Ampliacion (Fase 9 ampliada) — Marcar deudas como pagadas

Lo que esta seccion marcaba como "pendiente / fuera de alcance" (boton
"Marcar como pagado" y tabla de liquidaciones ya realizadas) se ha
implementado:

- Tabla nueva `settlement_payments` (`src/db/schema/settlement-payments.ts`,
  migracion `drizzle/0007_thin_carlie_cooper.sql`): registra que una
  transaccion sugerida (origen, destino, importe, moneda, ambito
  grupo/subgrupo) se ha saldado realmente fuera de la app, con el metodo
  usado (`settlement_payment_method`: `cash` | `bizum` | `transfer`, ver
  `src/lib/settlements/methods.ts`).
- `getGroupSettlement` (`src/lib/settlements/service.ts`) resta estos
  importes de los balances netos **antes** de recalcular el optimo de
  transacciones, en el mismo ambito con el que se registro el pago: una
  deuda ya marcada como pagada deja de aparecer como pendiente la
  siguiente vez que se consulta la liquidacion, sin necesidad de tocar los
  gastos originales.
- `recordSettlementPayment` (mismo fichero) solo permite marcar una deuda
  como pagada a los dos implicados en ella o a un administrador del grupo;
  registra un log de auditoria (`entityType: "settlement_payment"`) y
  notifica al otro implicado (no a quien registra el pago) con el importe
  y el metodo usado (`notification_type: "settlement_payment_recorded"`,
  ver `src/db/schema/notifications.ts` y `src/components/notifications-bell.tsx`).
- Ruta nueva `POST /api/groups/[groupId]/settlement/payments`
  (`src/app/api/groups/[groupId]/settlement/payments/route.ts`), validada
  con `src/lib/validation/settlements.ts`.
- UI: `SettlementCard` (`src/components/settlement-card.tsx`) anade un
  boton "Marcar como pagado" en cada transaccion sugerida que abre un
  dialogo para elegir el metodo (Select con las mismas tres opciones) y
  confirmar; tras confirmarlo, se recarga la liquidacion. El boton solo se
  muestra a los implicados en la deuda o a un administrador (`groupId`,
  `currentUserId`, `isAdmin` pasados desde `group-detail-client.tsx` /
  `subgroup-detail-client.tsx` via `GroupSummaryCard`). El resumen
  combinado multi-moneda (`convertedOverall`) no muestra el boton: se
  recalcula automaticamente a partir de las monedas individuales ya
  ajustadas, marcar los pagos por moneda es suficiente.
- Verificado con `tsc --noEmit`, `vitest run` (53/53) y `next build`
  (nueva ruta `/api/groups/[groupId]/settlement/payments` generada
  correctamente). Migracion aplicada con `pnpm db:migrate`.

## Fase 10 - Multimoneda y funcionamiento offline (implementacion avanzada, pendiente de endurecimiento)

Esta fase amplia la PWA de Fase 7 con conversion a una moneda base por
grupo y soporte offline para consultar datos ya visitados y crear gastos
sin conexion. La funcionalidad principal esta implementada, aunque aun
requiere las pruebas y medidas de robustez del backlog posterior.

### Implementado

- `groups.base_currency_code` permite elegir la moneda de referencia al
  crear un grupo (EUR por defecto).
- `exchange_rates` guarda los cambios diarios del Banco Central Europeo.
  `src/lib/exchange-rates/service.ts` descarga y parsea el XML, almacena
  las tasas conocidas y usa la ultima disponible si el BCE falla.
- Gastos, estadisticas y liquidaciones muestran valores convertidos. El
  endpoint `GET /api/groups/[groupId]/expenses/convert-preview` ofrece una
  previsualizacion antes de guardar.
- `src/lib/offline/db.ts` mantiene en IndexedDB una cache de lectura y una
  cola persistente de gastos creados sin conexion.
- Las pantallas recuperan los ultimos datos disponibles cuando falla la
  red y avisan mediante `OfflineBanner` de que pueden estar desactualizados.
- Los gastos offline aparecen como filas locales pendientes, se pueden
  descartar y se reenvian mediante `OfflineSyncManager` al recuperar red.
- `public/sw.js` conserva paginas visitadas y recursos estaticos. Las
  peticiones `/api/*` no se cachean en el service worker; su respaldo vive
  en IndexedDB.

Esto supera el pendiente historico de Fase 7 sobre cola de peticiones y
escritura diferida. No se usa la API nativa `Background Sync`: el reenvio
se activa al arrancar la app o recibir el evento `online`.

### Validacion tecnica actual

- `pnpm test`: 4 ficheros, 29 tests, todos correctos.
- `pnpm typecheck`: correcto.
- `pnpm build`: correcto; genera 25 paginas y todas las rutas API.
- Los tests solo cubren logica pura de dinero, repartos, sustitucion de
  administrador y optimizacion de liquidaciones. No hay cobertura
  automatizada especifica de esta fase.

## Fase 11 - Importacion desde Splitwise mediante API (implementada)

Objetivo: permitir que un usuario migre a Gatso sus grupos, participantes,
gastos, repartos y pagos historicos de Splitwise sin introducirlos a mano.
La importacion sera unidireccional (Splitwise -> Gatso), explicita,
reanudable e idempotente; inicialmente no se plantea una sincronizacion
bidireccional continua.

La API oficial de Splitwise v3 ofrece autenticacion OAuth y los recursos
necesarios: `get_current_user`, `get_groups`, `get_group/{id}` y
`get_expenses`. Este ultimo admite `group_id`, filtros `dated_*` y
`updated_*`, y paginacion mediante `limit`/`offset` (20 por defecto). Los
gastos incluyen coste, moneda, fecha, cantidades pagadas y debidas por
usuario, pagos y estado de borrado.

Documentacion oficial: `https://dev.splitwise.com/`.

### Alcance de la primera version

- Conectar una cuenta Splitwise mediante OAuth.
- Seleccionar uno o varios grupos accesibles para el usuario conectado.
- Mostrar una vista previa antes de escribir en Gatso.
- Crear un grupo nuevo o importar en uno existente administrado por el
  usuario.
- Mapear participantes Splitwise con usuarios Gatso.
- Importar gastos y repartos conservando exactamente los balances por
  moneda.
- Ejecutar la migracion como trabajo persistente con progreso, reintentos,
  cancelacion cooperativa e informe final.
- Poder repetir o reanudar la importacion sin crear duplicados.

Quedan fuera de la primera version la sincronizacion bidireccional, la
escritura en Splitwise y la importacion silenciosa en segundo plano sin una
confirmacion previa del usuario.

### OAuth y proteccion de credenciales

- Registrar Gatso como aplicacion OAuth en Splitwise y configurar callbacks
  separados para desarrollo, Preview y Production.
- Anadir `SPLITWISE_CLIENT_ID`, `SPLITWISE_CLIENT_SECRET` y una clave de
  cifrado especifica a las variables de entorno.
- Implementar `state` aleatorio, de un solo uso, expiracion corta y
  vinculacion a la sesion Gatso que inicio la conexion.
- Solicitar solo lectura cuando la configuracion de Splitwise lo permita.
  Gatso no modificara ni eliminara datos del origen.
- Cifrar tokens en reposo, no enviarlos al navegador ni escribirlos en logs,
  y permitir desconectar/revocar la integracion.
- Para una migracion puntual, eliminar el token al terminar por defecto; el
  usuario debe aceptar expresamente conservarlo para futuras importaciones
  incrementales.

### Modelo de datos propuesto

- `external_connections`: propietario Gatso, proveedor (`splitwise`), token
  cifrado, estado, expiracion y fechas de creacion/ultimo uso.
- `import_jobs`: usuario, proveedor, estado (`draft`, `preview`, `running`,
  `completed`, `partial`, `failed`, `cancelled`), progreso, contadores,
  cursor, errores resumidos y marcas temporales.
- `external_entity_mappings`: proveedor, tipo (`group`, `user`, `expense`,
  `payment`), ID externo, ID Gatso, version/hash externo y fecha de ultima
  importacion. Una restriccion unica debe impedir duplicar una entidad.
- `import_job_errors`: errores por entidad, recuperables y descargables sin
  almacenar payloads personales completos.

Credenciales, emails, nombres reales y otros datos personales recibidos de
Splitwise no se incorporaran al log de auditoria. Solo se guardaran los IDs
externos opacos, decisiones de mapeo y resultados imprescindibles. Esto
mantiene el principio de privacidad por diseno de Gatso.

### Flujo de usuario

1. El usuario abre "Importar desde Splitwise" y conecta su cuenta por OAuth.
2. Gatso consulta el usuario actual y sus grupos; el usuario elige cuales
   quiere migrar.
3. Se genera una vista previa con participantes, rango de fechas, monedas,
   numero de gastos/pagos y datos que no puedan representarse directamente.
4. Para cada origen se elige crear grupo o importar en uno existente. La
   segunda opcion exige rol de administrador.
5. Gatso propone el mapeo de participantes, pero ningun emparejamiento por
   nombre o email se confirma automaticamente: debe revisarse para evitar
   fusionar personas distintas.
6. Los participantes sin cuenta Gatso se modelaran como identidades externas
   invitables o mediante la solucion que se defina antes de implementar. No
   se crearan cuentas con contrasenas ficticias.
7. El usuario revisa la reconciliacion previa y confirma el job. La UI
   muestra progreso y termina con importados, actualizados, omitidos y
   fallidos.

### Mapeo financiero

- Conservar nombre del grupo, moneda, descripcion, fecha efectiva y
  participantes. La moneda base se propone desde la predominante/preferida,
  pero debe confirmarse.
- Convertir `paid_share` y `owed_share` a centimos enteros sin usar coma
  flotante para los calculos finales.
- Splitwise admite varios pagadores por gasto y Gatso tiene actualmente un
  unico `payerId`. Antes de importar debe elegirse entre ampliar Gatso a
  multiples pagadores (opcion preferida) o descomponer el gasto en registros
  enlazados que conserven exactamente los saldos.
- Traducir a `equal`, `percentage` o `fixed` cuando el reparto encaje
  exactamente. Los casos restantes se guardaran como importes fijos por
  usuario para no perder centimos.
- Los pagos/liquidaciones de Splitwise solo se importaran cuando exista la
  entidad de pagos descrita en el backlog. No se convertiran en gastos
  normales porque cambiaria su significado.
- Definir tratamiento explicito para gastos borrados, comentarios,
  categorias, recibos, recurrencia y gastos fuera de grupo. Los datos no
  soportados apareceran en vista previa e informe; nunca se descartaran en
  silencio.
- Conservar las fechas externas disponibles y marcar los registros como
  importados, sin atribuir su creacion manual al usuario que ejecuto el job.

### Paginacion, incrementalidad e idempotencia

- Leer `get_expenses` por paginas hasta recibir menos elementos que el
  limite; persistir `offset` y progreso para poder reanudar.
- Usar `updated_after` para posteriores importaciones incrementales, pero
  mantener el ID externo como clave principal de deduplicacion.
- Procesar lotes en transacciones pequenas: un fallo no debe revertir grupos
  completados ni dejar un gasto sin todas sus participaciones.
- Tratar `401`, `403`, `404`, `429` y `5xx` con reautenticacion cuando
  corresponda, backoff exponencial, jitter y reintentos acotados.
- No asumir que HTTP 200 implica exito cuando la respuesta incluya errores.
- Ejecutar en servidor/cola con estado persistente; no depender de que el
  navegador permanezca abierto.
- Una repeticion completa actualizara u omitira entidades mapeadas y nunca
  creara duplicados.

### API y UI propuestas

- Inicio OAuth y callback exclusivamente servidor para Splitwise.
- `GET /api/imports/splitwise/groups`: seleccion del origen.
- `POST /api/imports/splitwise/preview`: validacion y plan sin escritura
  financiera.
- `POST /api/imports/splitwise/jobs`: confirmacion y creacion del trabajo.
- `GET /api/imports/[jobId]`: progreso e informe.
- `POST /api/imports/[jobId]/cancel` y `/retry`: control seguro.
- Pantalla `/settings/import/splitwise`, accesible solo al propietario de la
  conexion.

Todas las mutaciones usaran `requireSession`, CSRF, Zod, rate limiting
especifico y comprobacion de propiedad/rol. Ninguna respuesta devolvera
tokens ni payloads personales completos de Splitwise.

### Reconciliacion, auditoria y rollback

- Antes de confirmar, comparar balances de origen y destino por moneda y
  participante.
- Tras importar, recalcular y no marcar `completed` si existe una diferencia
  distinta de cero. El informe indicara grupo, moneda y participante.
- Ofrecer dry-run repetible e informe JSON/CSV de reconciliacion, omisiones y
  errores.
- Auditar conexion/desconexion, inicio, cancelacion, resultado y mapeos sin
  tokens, emails ni nombres reales procedentes de Splitwise.
- Definir rollback por job: eliminar solo entidades creadas por ese job y
  solo si no fueron modificadas despues en Gatso. Debe ser idempotente y
  auditado.

### Pruebas y criterio de finalizacion

- Tests unitarios con fixtures anonimizados: paginacion, decimales, varias
  monedas/pagadores, pagos, borrados y respuestas incompletas.
- Tests de contrato del cliente HTTP: OAuth revocado/expirado, `429`, timeout,
  reintentos y errores incluidos en respuestas 200.
- Integracion: deduplicacion, reanudacion, rollback, permisos y
  reconciliacion exacta.
- E2E: conectar, previsualizar, mapear, importar, revisar informe y repetir.
- La fase solo se considerara completada si una segunda ejecucion crea cero
  duplicados y todos los balances por moneda coinciden exactamente con
  Splitwise.

### Estado de implementacion (completado en esta ronda)

Todo lo descrito arriba (diseno original) se implemento con las
decisiones concretas siguientes, cada una documentada tambien como
comentario en el codigo correspondiente:

- **Cifrado y variables de entorno**: `src/lib/crypto/secret-box.ts`
  (AES-256-GCM) cifra los tokens OAuth antes de guardarlos;
  `SPLITWISE_CLIENT_ID`/`SPLITWISE_CLIENT_SECRET`/`IMPORT_ENCRYPTION_KEY`
  anadidas a `src/lib/env.ts` como **opcionales** (no rompen build/CI en
  entornos sin la integracion configurada) y a `.env.example`.
- **Esquema de BD** (migracion `drizzle/0009_vengeful_prima.sql`):
  `external_connections` (token cifrado, unico por usuario+proveedor),
  `import_jobs` (estado/contadores/cursor de paginacion/cancelacion
  cooperativa), `external_entity_mappings` (clave de idempotencia:
  `UNIQUE(provider, entityType, externalId)`), `import_job_errors`
  (mensaje acotado, nunca payloads completos del proveedor).
- **Cliente HTTP y OAuth** (`src/lib/imports/splitwise/client.ts`,
  `oauth-state.ts`): URLs/endpoints verificados contra la documentacion
  oficial (`dev.splitwise.com`) y el SDK oficial en Python, no
  inventados. CSRF del flujo OAuth via double-submit cookie (mismo
  patron que `csrf.ts`). Rutas `GET .../oauth/start`,
  `GET .../oauth/callback`, `GET|DELETE .../connection`.
- **Mapeo financiero** (`mapping.ts`): `chooseSplitForSingleExpense`
  reconstruye el metodo de reparto de Gatso (equal/percentage/fixed) mas
  especifico que reproduce exactamente los `owed_share` de Splitwise.
  **Decision documentada para varios pagadores por gasto** (Splitwise lo
  permite, Gatso no): se descompone en gastos Gatso enlazados por
  pagador (`decomposeMultiPayerExpense`, algoritmo de redondeo
  controlado de tablas de doble entrada) en vez de ampliar el modelo de
  datos de Gatso a multi-pagador, para no tocar el patron
  Strategy/validacion/UI/estadisticas ya existentes de las Fases 3/4/9.
  `src/lib/money.ts` gano `distributeProportionally` (generalizacion de
  `distributeByBasisPoints`) para soportar este algoritmo.
- **Vista previa** (`preview-service.ts`): solo lectura, agrega
  participantes/rango de fechas/monedas/contadores de
  gastos/pagos/borrados y datos no representables en Gatso
  (recibos/comentarios/recurrencia/categorias), nunca escribe nada.
- **Job de importacion** (`job-service.ts`): **decision de arquitectura
  documentada** -- sin cola/worker propio (Gatso son funciones
  serverless de Vercel), cada llamada a `runJobChunk` procesa paginas
  hasta agotar el trabajo o un presupuesto de tiempo, persistiendo
  cursor+contadores tras cada pagina; si se agota el presupuesto el job
  queda `"running"` y el cliente lo reanuda con `retry`. Pagos
  (`payment: true`) se mapean a `settlement_payments` (reutilizando la
  entidad de pagos ya existente desde la Fase 9 ampliada). `createExpense`
  gano un parametro interno `skipRateLimit` (nunca expuesto por HTTP)
  para no aplicar el limite de "1 gasto cada N segundos" a una
  importacion en lote legitima.
- **Participantes sin cuenta Gatso (ampliacion v0.8.0)**: si una persona
  de Splitwise queda sin mapear, el importador crea una identidad
  provisional (`users.is_provisional`) con el mismo `displayName` de
  Splitwise, la anade al grupo y puede importar inmediatamente sus
  gastos y pagos. En paralelo genera una invitacion pendiente vinculada
  a su identificador externo. Al aceptar el enlace, la persona reclama
  esa misma fila de usuario (se actualizan username/credenciales y
  `is_provisional=false`), conservando UUID, membresias, gastos y
  balances. Login y recuperacion rechazan explicitamente identidades
  provisionales. Migracion: `0015_splitwise_provisional_users.sql`.
- **Participantes historicos**: la vista previa ya no se limita a los
  miembros actuales de `get_group`; incorpora tambien los perfiles
  embebidos en los gastos historicos, por lo que una persona que abandono
  el grupo puede conservar su nombre real de Splitwise y mapearse.
- **Reconciliacion** (`reconciliation.ts`/`reconciliation-service.ts`):
  compara el `net_balance` que Splitwise ya calcula por gasto/usuario
  (mas fiable que recalcularlo) contra el balance que Gatso calcula para
  esos mismos usuarios (reutilizando `getGroupSettlement`). Repetible en
  cualquier momento, solo lectura.
- **Rollback** (`rollback-service.ts`): borra unicamente las entidades
  creadas por un job concreto (via `createdByJobId`), protegiendo las
  que se hayan editado despues en Gatso; idempotente y auditado.
- **UI** `/settings/import/splitwise`: asistente paso a paso completo
  (conectar, elegir grupo, vista previa, destino, mapeo, confirmar,
  barra de progreso porcentual con elementos procesados y polling
  automatico, comprobar balances, invitaciones pendientes y revertir).
  La creacion del job responde antes de ejecutar el primer chunk para que
  el progreso sea visible desde el primer instante. Enlace "Importar"
  anadido a `SiteHeader`.
- Verificado tras la ampliacion v0.8.0 con `tsc --noEmit`, `vitest run`
  (95/95; incluye cobertura de participantes historicos), `next build`
  y `git diff --check`. La migracion 0015 fue generada con snapshot de
  Drizzle y aplicada contra la BD configurada. La cobertura previa de la
  fase (cliente/estado OAuth, mapeo financiero, paginacion,
  vista previa, clasificacion/estado de jobs, reconciliacion, cifrado de
  secretos) se mantiene.

### Limitaciones conocidas de esta implementacion (v1)

- **Sin importacion incremental real todavia**: el diseno contempla
  `updated_after` para reimportaciones posteriores, pero `job-service.ts`
  trata cada gasto como "crear si no existe, omitir si ya existe" (nunca
  actualiza un gasto ya importado que cambio en Splitwise). Repetir un
  job es seguro (no duplica) pero no refleja ediciones posteriores en
  origen.
- **Multi-pagador**: la descomposicion en gastos enlazados es
  matematicamente exacta (verificado con tests, incluyendo el peor caso
  de redondeo), pero cambia la forma en que se ven esos gastos en Gatso
  (varios gastos con la nota "(parte pagada por este usuario)" en vez de
  uno solo con varios pagadores, porque Gatso no modela eso).
- **Presupuesto de tiempo por chunk** (`CHUNK_TIME_BUDGET_MS`, 8s): no
  verificado contra un limite real de funcion serverless en Vercel en
  este entorno (no se ha desplegado); es un valor conservador pensado
  para el plan Hobby (10s), se puede ajustar si el plan de despliegue
  real tiene otro limite.
- **Sin tests de integracion reales** (API HTTP real de Splitwise, base
  de datos real, UI en navegador): toda la logica pura (mapeo financiero,
  paginacion, clasificacion, reconciliacion, cifrado, estado OAuth) tiene
  tests unitarios sin red ni BD; la orquestacion que si toca BD/HTTP
  (`job-service.ts`, `connection-service.ts`, rutas) no tiene cobertura
  automatizada, mismo patron ya documentado para el resto del proyecto
  (ver "Prioridad alta - pruebas de integracion y E2E" mas abajo).
- **Reconciliacion a nivel de grupo completo**, no solo de lo que trajo
  un job concreto (decision de alcance v1, documentada en
  `reconciliation-service.ts`): correcto para el caso de uso principal
  (una importacion unica), sera necesario revisarlo si se implementan
  importaciones incrementales reales.
- La app OAuth y un flujo real de conexion/importacion ya se probaron en
  el entorno actualmente configurado. Sigue siendo una tarea operativa
  verificar por separado credenciales, callback y
  `IMPORT_ENCRYPTION_KEY` en cada entorno Preview/Production.

## Backlog general priorizado

### Prioridad alta - consistencia y robustez (implementado)

#### Idempotencia de la sincronizacion offline (completado)

`clientRequestId` (el mismo `localId` que ya generaba la cola offline,
`crypto.randomUUID()`) se anade ahora al contrato de creacion de gastos:

- **Esquema**: `expenses.client_request_id` (`varchar(64)`, nullable) con
  indice `UNIQUE` (`drizzle/0006_supreme_scarlet_spider.sql`; Postgres
  permite multiples `NULL` en un indice unico, asi que los gastos creados
  online sin este campo no se ven afectados).
- **Validacion**: `createExpenseSchema`
  (`src/lib/validation/expenses.ts`) anade `clientRequestId:
  z.string().uuid().optional()`.
- **Servicio** (`createExpense`, `src/lib/expenses/service.ts`): si el
  payload trae `clientRequestId`, se comprueba primero si ya existe un
  gasto con ese id en el grupo (`findExpenseByClientRequestId`) y, si es
  asi, se devuelve directamente sin repetir validaciones ni insertar de
  nuevo (camino rapido para el caso normal: reintento tras perder la
  respuesta de un envio que si tuvo exito). Como defensa adicional frente
  a una carrera entre dos reintentos simultaneos, si el `INSERT` choca con
  el indice `UNIQUE` (`isUniqueViolation`, mismo helper ya usado en
  grupos/monedas/invitaciones) se vuelve a consultar tras el rollback de
  la transaccion y se devuelve el gasto ya creado por la otra peticion en
  vez de propagar el error 500.
- **Cliente** (`src/lib/offline/sync.ts`): `syncOne` ahora envia
  `{ ...item.payload, clientRequestId: item.localId }`; como `localId` no
  cambia entre reintentos de un mismo elemento de la cola
  (`src/lib/offline/db.ts`), todos los reintentos de un mismo gasto
  offline comparten el mismo `clientRequestId`.
- Migracion generada con `pnpm db:generate` y aplicada con `pnpm
  db:migrate` contra la base de datos de `.env.local` en este entorno.

#### Pruebas de la Fase 10 (cobertura anadida, parcial)

Cobertura nueva (todos los tests son puros/mockeados, sin tocar
`DATABASE_URL` real — imprescindible porque el paso `Test` de
`ci.yml` ejecuta `pnpm test` sin ninguna variable de entorno, a
diferencia del paso `Build`):

- `src/lib/exchange-rates/ecb-xml.test.ts`: parseo del XML del BCE (varias
  monedas, una sola moneda —caso en el que `fast-xml-parser` no devuelve
  array—, tasas invalidas ignoradas, XML con formato inesperado o sin
  ninguna tasa valida lanza `AppError`).
- `src/lib/exchange-rates/freshness.test.ts`: decision de reintento
  (`shouldAttemptEcbRefresh`), incluyendo el caso de fin de
  semana/festivo con TTL activo (ver siguiente punto).
- `src/lib/concurrency/dedupe.test.ts`: `createSingleFlight` (llamadas
  concurrentes reutilizan la misma ejecucion, tanto en exito como en
  rechazo; una llamada nueva tras resolverse la anterior dispara una
  ejecucion nueva).
- `src/lib/offline/sync.test.ts`: `syncPendingExpenses`/`syncOne` con
  `@/lib/api/client-fetch` y `./db` mockeados — confirma que el payload
  reenviado siempre incluye `clientRequestId = localId` (incluso tras un
  reintento por fallo de red), gestion de aceptado/rechazado/error de red
  por elemento de la cola, y que los elementos ya `"syncing"` se omiten.
- Pendiente (fuera de alcance de este cambio, requiere infraestructura de
  BD de test dedicada — ver "Prioridad alta - pruebas de integracion y
  E2E" mas abajo): tests de integracion reales contra Postgres para
  `createExpense`, IndexedDB real (jsdom/fake-indexeddb), service worker,
  y estadisticas/liquidaciones multimoneda end-to-end.

#### Actualizacion de tipos del BCE (completado)

`src/lib/exchange-rates/service.ts` reescrito para resolver los tres
puntos pendientes:

- **TTL en vez de solo comparar con "hoy"** (`src/lib/exchange-rates/freshness.ts`,
  `shouldAttemptEcbRefresh`): el BCE no publica tasas en fin de
  semana/festivos, asi que comparar unicamente `latestStoredDate` con la
  fecha actual causaba una peticion al BCE en cada llamada esos dias. Se
  guarda el resultado de cada intento (exito o error) en `app_config`
  (clave `ecb_last_fetch_status`, valor JSON `{attemptedAt, status,
  error?}`, mismo patron key/value que `expense_creation_rate_limit_seconds`
  de Fase 3) y no se reintenta si el ultimo intento fue hace menos de
  `ECB_RETRY_INTERVAL_MS` (6h), independientemente de si tuvo exito o no.
- **Evitar descargas concurrentes**: `createSingleFlight`
  (`src/lib/concurrency/dedupe.ts`), utilidad generica que memoiza la
  promesa en curso — si varias peticiones HTTP simultaneas en la misma
  instancia calida de la funcion serverless disparan `ensureFreshEcbRates`
  a la vez, solo la primera llega a llamar al BCE; el resto espera esa
  misma promesa. No es un lock distribuido entre instancias distintas: esa
  ventana la sigue acotando el TTL anterior y, en ultima instancia, la
  clave `UNIQUE (currency_code, as_of_date)` ya existente de
  `exchange_rates` (`onConflictDoUpdate`, idempotente).
- **Observabilidad: distinguir "BCE caido" de "moneda sin tasa"**: si
  `getRateToEur` no encuentra ninguna fila para una moneda, ahora consulta
  el ultimo intento registrado; si fallo, lanza `AppError` con codigo
  `ecb_unavailable` (el problema es el BCE); si no fallo (o nunca se
  intento), mantiene el `exchange_rate_unavailable` original (el problema
  es que esa moneda nunca ha tenido tasa).
- Parseo del XML extraido a `src/lib/exchange-rates/ecb-xml.ts`
  (`parseEcbEnvelope`) para poder testearlo sin red ni base de datos.
- Verificado con `tsc --noEmit`, `vitest run` (53/53, incluye 24 tests
  nuevos de esta ronda de cambios) y `next build`.

### Backlog aun pendiente (no cubierto en esta ronda)

### Prioridad alta - pruebas de integracion y E2E

Faltan pruebas con base de datos y navegador para autenticacion, sesiones,
CSRF, rate limiting, permisos, grupos/subgrupos, invitaciones, abandono,
gastos, auditoria inmutable, monedas, notificaciones y PWA/offline. Se
recomienda Postgres aislado para integracion y una suite E2E contra un build
de produccion.

Debe incluirse especificamente el flujo Splitwise v0.8.0: creacion
idempotente del participante provisional, importacion de sus gastos y
pagos, invitacion automatica, reclamacion de la misma identidad y
conservacion de UUID/balances. `job-service.ts`, `invitation-service.ts`
y las rutas que tocan BD/HTTP siguen sin cobertura de integracion.

### Prioridad alta - restaurar lint

`pnpm lint` no llega a analizar el proyecto porque la version instalada
de `typescript-eslint` no soporta todavia TypeScript 7. El typecheck, los
tests y el build pasan, pero hay que alinear esas dependencias (o usar
temporalmente la API de TypeScript compatible recomendada por el propio
tooling) para recuperar ESLint en local y CI.

### Prioridad media - escalabilidad y operacion (completado)

#### Paginacion por cursor en gastos, notificaciones y auditoria

- **Nuevo `src/lib/pagination.ts`**: helpers genericos `encodeCursor`/
  `decodeCursor` (cursor opaco en base64url) y `clampLimit`/`Page<T>`,
  reutilizados por los tres casos siguientes. Es la primera paginacion
  por cursor del proyecto (antes no existia ninguna, ni por cursor ni por
  offset: todas las listas se devolvian completas).
- **`listExpenses`** (`src/lib/expenses/service.ts`): keyset sobre
  `(expenseDate, createdAt, id)` (mismo orden que el `ORDER BY` ya
  existente), `GET /api/groups/:groupId/expenses` acepta `?cursor=`/
  `?limit=` y devuelve `{ expenses, nextCursor }`. El frontend
  (`group-detail-client.tsx`, `subgroup-detail-client.tsx`) usa un nuevo
  helper `src/lib/expenses/fetch-all.ts` que recorre las paginas de forma
  transparente (limite de seguridad 50 paginas) para no romper la
  busqueda/filtros ya existentes en `GroupSummaryCard`, que esperan la
  lista completa.
- **`listNotifications`** (`src/lib/notifications/service.ts`): keyset
  sobre `(createdAt, id)`; nuevo `countUnreadNotifications` independiente
  de la paginacion (antes el contador de no leidas se calculaba sobre el
  array cargado, que ahora es solo la primera pagina). `GET
  /api/notifications` devuelve `{ notifications, nextCursor, unreadCount
  }`. `NotificationsBell` anade un boton "Cargar mas".
- **`getGroupAuditLog`/`getPlatformAuditLog`** (`src/lib/audit/service.ts`):
  keyset sobre `(createdAt, id)` + filtros `action`/`entityType` (antes
  devolvian siempre los ultimos 100 eventos sin forma de ver mas ni de
  acotar la busqueda). Rutas `GET .../audit-log` aceptan `?action=`,
  `?entityType=`, `?cursor=`, `?limit=`. `GroupAuditLogCard` anade dos
  `Select` de filtro y un boton "Cargar mas"; `getPlatformAuditLog` queda
  con el mismo soporte a nivel de API pero sigue sin tener una pantalla
  propia en el frontend (situacion preexistente, no es una regresion de
  este cambio).

#### Retencion y limpieza de datos operativos

- **Nuevo `src/lib/retention/service.ts`**: `cleanupAuthAttempts` (borra
  intentos de login/recuperacion mas antiguos que su periodo de
  retencion, 90 dias por defecto), `cleanupReadNotifications` (solo
  notificaciones YA LEIDAS, 60 dias por defecto; las no leidas nunca se
  borran automaticamente), `cleanupOldExchangeRates` (borra tasas de
  cambio superadas por una fila mas reciente de la misma moneda y mas
  antiguas que su retencion, 90 dias por defecto; `getRateToEur` solo usa
  siempre la ultima fila por moneda, y nunca se borra esa ultima fila
  aunque sea antigua) y `cleanupRateLimitAttempts` (30 dias por defecto).
  Todos los periodos son ajustables via `app_config` sin redeploy (mismo
  patron que `expense_creation_rate_limit_seconds`). Deliberadamente
  **nunca toca `audit_logs` ni datos financieros** (`expenses`,
  `expense_shares`, `settlement_payments`).
- `pnpm db:cleanup` (`src/db/cleanup.ts`, mismo patron que `db:seed`)
  ejecuta `runRetentionCleanup` y muestra un resumen. Nuevo workflow
  programado `.github/workflows/data-retention.yml` (cron semanal +
  `workflow_dispatch`) lo ejecuta contra produccion, igual que
  `db-migrate.yml`.
- **Cache local de IndexedDB** (`src/lib/offline/db.ts`): nuevo
  `pruneStaleCache()` borra entradas de `CACHE_STORE` (respuestas
  cacheadas para el modo offline) de mas de 30 dias; se invoca al montar
  `ServiceWorkerRegister` (ahora corre siempre, no solo en produccion
  como el registro del SW). Nunca afecta a `QUEUE_STORE` (cola de gastos
  pendientes de sincronizar).

#### Rate limiting en registro, invitaciones y union a grupos

- **Nueva tabla generica `rate_limit_attempts`** (`scope`+`key`+
  `createdAt`, migracion `drizzle/0008_large_bruce_banner.sql`) y
  `src/lib/rate-limit/service.ts` (`enforceKeyedRateLimit`/
  `recordRateLimitAttempt`), deliberadamente separada de
  `auth_attempts`/`auth-rate-limit.ts` (Fase 4, especifico de
  login/recover con su propio enum) para que una accion nueva no
  requiera migrar un enum.
- **Registro** (`POST /api/auth/register`): limita intentos repetidos de
  registrar el mismo alias (5 cada 15 min por defecto). No evita crear
  muchos alias distintos rapidamente (no hay IP que limitar por diseno de
  privacidad), pero anade friccion a probar un alias concreto.
- **Creacion de invitaciones** (`createGroupInvitation`): limita por
  usuario que las genera (20/hora por defecto), evita spam de enlaces de
  invitacion.
- **Aceptacion de invitaciones** (`acceptGroupInvitation`, ruta publica
  sin sesion): al no haber ninguna identidad previa disponible sin
  almacenar IP, se aplica un limite **global** a toda la accion (60/min
  por defecto) para frenar un escaneo automatizado de tokens de 32
  caracteres.
- **Union a grupo por codigo** (`joinGroupByInviteCode`): limita por
  usuario autenticado que intenta unirse (20 cada 15 min por defecto),
  frena adivinar codigos sin bloquear a quien se une legitimamente a
  varios grupos reales en poco tiempo.
- Todos los limites configurables via `app_config`. `runRetentionCleanup`
  tambien purga esta tabla nueva.
- Verificado con `tsc --noEmit`, `vitest run` (53/53) y `next build` tras
  cada uno de los cuatro cambios anteriores; migracion `0008` generada y
  aplicada contra la base de datos de `.env.local`.

### Funcionalidad de producto pendiente

Todos los puntos de este backlog (administradores de plataforma,
auditoria global, politica de grupos con cero miembros, contrasenas
comunes/comprometidas y notificaciones push) estan completados; ver las
secciones dedicadas mas abajo para el detalle de cada implementacion.

### Verificacion manual y produccion

- Probar en HTTPS y dispositivos reales instalacion Android/iOS,
  actualizacion del service worker, recarga offline, fallback, IndexedDB y
  sincronizacion tras cerrar/reabrir la app o reiniciar el dispositivo.
- Verificar degradacion cuando IndexedDB no esta disponible, alcanza cuota o
  el navegador elimina datos locales.
- Revisar periodicamente Vercel/Neon: separacion de secretos entre
  Preview/Production, proteccion del Environment `production` de GitHub,
  migraciones, health, Argon2, region de funciones y conectividad.
- Verificar en Vercel que `CHUNK_TIME_BUDGET_MS = 8000` deja margen real
  suficiente y que la barra de progreso avanza correctamente con grupos
  grandes y varios chunks.

## Rebranding — Nuevo logotipo

- Sustituido el SVG fuente del icono (`src/app/icon.svg` y su copia
  `public/icons/icon.svg`, deben mantenerse identicos) por un nuevo diseno
  de dos trazos enlazados con un signo igual, recoloreado con los tokens de
  `src/app/globals.css` en vez de la paleta original de la propuesta: fondo
  en dos tonos oscuros de marca (`#2f2147` a `#171521`), trazos en los pares
  pastel aqua/info (`#d9edf0`→`#cbe4f4`) y lavanda secundaria/primaria
  (`#e8def8`→`#c9c2f0`), y signo igual en blanco/crema de tarjeta.
- `scripts/generate-pwa-icons.mjs`: el color `background` usado para
  rellenar el margen transparente de las esquinas redondeadas pasa de
  `#c9c2f0` a `#171521` (el nuevo tono de fondo del icono); regenerados
  `public/icons/icon-192.png`, `icon-512.png`,
  `icon-maskable-{192,512}.png` y `src/app/apple-icon.png` con
  `pnpm icons:generate`.
- `src/app/manifest.ts`: `background_color`/`theme_color` actualizados a
  `#171521`/`#211a44` para reflejar el nuevo fondo oscuro del icono en la
  pantalla de carga y la UI del sistema al instalar la PWA.
- Verificado con `tsc --noEmit` y `vitest run` (104/104); sin cambios de
  codigo fuera de branding.

## UI de administradores de plataforma

- **Nueva pagina `/admin`** (`src/app/(app)/admin/page.tsx`): landing con
  tarjetas hacia las secciones de administracion (antes el enlace del
  header llevaba directo a `/admin/currencies`, unica pantalla existente).
  `SiteHeader` ahora enlaza a `/admin` en vez de `/admin/currencies`
  (`src/components/site-header.tsx`).
- **`setPlatformAdmin`/`listAllUsers`** (`src/lib/users/service.ts`): mismo
  patron que `setCurrencyActive`/`listAllCurrencies` (Fase 6). Dos
  salvaguardas nuevas para evitar dejar la plataforma sin administradores:
  no se puede revocar el propio rol (`cannot_revoke_self`) ni el del
  ultimo administrador restante, comprobado con `count()` dentro de la
  misma transaccion (`cannot_revoke_last_admin`). Antes el rol solo podia
  activarse con un UPDATE manual en base de datos; eso sigue siendo el
  unico camino para el primer administrador, pero a partir de ahi ya hay
  UI para gestionar al resto.
- **`src/lib/audit/service.ts`**: nuevo valor `"user"` en `AuditEntityType`
  (sigue siendo un `varchar(32)`, no un enum de Postgres, por lo que no
  hizo falta migracion). Cada concesion/revocacion queda registrada como
  `action: "update"`, `entityType: "user"`, con `beforeData`/`afterData`
  `{ isPlatformAdmin }`, visible via `GET /api/admin/audit-log` y, desde el
  siguiente apartado, tambien en `/admin/audit-log`.
- **Rutas**: `GET /api/admin/users` (`listAllUsers`), `PATCH
  /api/admin/users/[userId]` (`setPlatformAdmin`), ambas con
  `requireSession` + `requirePlatformAdmin` dentro del servicio (mismo
  doble chequeo que `/api/admin/currencies`).
- **UI** (`src/app/(app)/admin/users/`): tabla con `Switch` por usuario
  (mismo patron que el catalogo de monedas); el interruptor se deshabilita
  visualmente cuando accionarlo revocaria el rol propio o el del ultimo
  administrador, evitando una llamada que el backend rechazaria igualmente.
- Verificado con `tsc --noEmit`, `next build` (rutas `/admin`, `/admin/users`,
  `/api/admin/users*` compiladas sin error de tipado de rutas) y `vitest run`
  (104/104).

## Pantalla de auditoria global de plataforma

- **Nueva pagina `/admin/audit-log`**
  (`src/app/(app)/admin/audit-log/admin-audit-log-client.tsx`): consume la
  misma API que ya existia sin frontend propio,
  `GET /api/admin/audit-log` (`getPlatformAuditLog`, paginado por cursor y
  filtrable por `action`/`entityType`). Mismo patron visual que
  `GroupAuditLogCard` (filtros `Select`, lista con `Badge` de accion,
  boton "Cargar mas"), pero como pagina propia con `Card` en vez de
  tarjeta colapsable dentro de otra pantalla: la auditoria de plataforma
  no tiene una pagina "padre" natural donde anidarla.
- `describeEntry` traduce las dos entidades globales existentes hoy
  (`currency`, `user`) a una frase legible, incluyendo el caso especifico
  de concesion/revocacion de administrador de plataforma introducido en
  el apartado anterior.
- Anadido como tercera tarjeta en `/admin`
  (`src/app/(app)/admin/page.tsx`), junto a "Administradores de
  plataforma" y "Monedas".
- Verificado con `tsc --noEmit`, `next build` (ruta `/admin/audit-log`
  compilada sin error de tipado de rutas) y `vitest run` (104/104).

## Politica para grupos con cero miembros: archivado en vez de borrado inmediato

- **Migracion `drizzle/0016_happy_beast.sql`**: nueva columna nullable
  `groups.archived_at`. `NULL` significa grupo activo (con al menos un
  miembro); una fecha significa archivado. Aplicada contra la base de
  datos de `.env.local` con `pnpm db:migrate`.
- **`leaveGroup`** (`src/lib/groups/service.ts`): cuando el ultimo miembro
  abandona el grupo, antes se borraba de inmediato (grupo, subgrupos,
  gastos, repartos, invitaciones y notificaciones via `onDelete:
  "cascade"`). Ahora se ARCHIVA en su lugar (`archivedAt = now()`) y todo
  ese contenido se conserva intacto. `joinGroupByInviteCode` anade
  `isNull(groups.archivedAt)` a la busqueda por codigo, por lo que el
  codigo de invitacion queda invalidado de forma automatica sin tener que
  regenerarlo.
- **`listArchivedGroups`/`restoreArchivedGroup`** (mismo fichero, solo
  administradores de plataforma via `requirePlatformAdmin`): permiten
  consultar los grupos archivados y devolverlos a estado activo
  (`archivedAt = NULL`) antes de que se borren en la limpieza diferida.
  Restaurar un grupo no le devuelve miembros: quien lo restaura debe
  volver a usar el codigo de invitacion para unirse.
- **Auditoria con visibilidad de plataforma**: los eventos de archivado y
  restauracion se registran con `groupId: null` (en vez del `groupId` real
  del grupo). Sin miembros, nadie podria consultarlos nunca en la
  auditoria propia del grupo (`requireGroupAdmin` exige membresia); al
  quedar con `groupId` nulo aparecen directamente en
  `getPlatformAuditLog`/`/admin/audit-log`, replicando el mismo mecanismo
  que antes ofrecia gratis el borrado en cascada (anulaba `groupId` en
  todo el historial del grupo al desaparecer este). Los eventos
  historicos previos al archivado (gastos, membresias...) mantienen su
  `groupId` original y quedan inaccesibles hasta que el grupo se restaura
  y alguien vuelve a ser administrador; se documenta como limitacion
  conocida en vez de reescribir todo el historial.
- **`cleanupArchivedGroups`** (`src/lib/retention/service.ts`, integrado en
  `runRetentionCleanup`/`pnpm db:cleanup`): elimina de forma definitiva los
  grupos archivados hace mas de `archived_groups_retention_days` (30 dias
  por defecto, ajustable via `app_config` como el resto de retenciones).
  Es la "eliminacion diferida": el borrado real solo ocurre si nadie lo
  restaura antes del plazo.
- **UI**: nueva pagina `/admin/groups`
  (`src/app/(app)/admin/groups/admin-groups-client.tsx`) con tabla de
  grupos archivados y boton "Restaurar" por fila; anadida como cuarta
  tarjeta en `/admin`. En `group-detail-client.tsx`, el mensaje de
  confirmacion al abandonar como ultimo miembro y el toast final se
  actualizan de "se borrara"/"Grupo eliminado" a "se archivara"/"Grupo
  archivado"; la respuesta de `POST /api/groups/:groupId/leave` renombra
  el campo `groupDeleted` a `groupArchived`.
- Verificado con `tsc --noEmit`, `next build` (rutas `/admin/groups`,
  `/api/admin/groups*` compiladas sin error de tipado de rutas), `pnpm
  db:generate`/`db:migrate` contra `.env.local` y `vitest run` (104/104).

## Verificacion de contrasenas comunes/comprometidas

- **Nuevo `src/lib/auth/common-passwords.ts`** (`isCommonPassword`):
  comprobacion totalmente local, sin llamada de red a ningun servicio
  externo tipo HaveIBeenPwned (evita depender de conectividad en
  registro/recuperacion, evita enviar cualquier derivada de la
  contrasena fuera del proceso, y hace la comprobacion testeable sin red).
  Rechaza dos categorias: una lista curada de contrasenas historicamente
  mas filtradas (secuencias numericas/de teclado, palabras de diccionario
  habituales, variantes triviales) y patrones que ningun listado fijo
  puede cubrir (mismo caracter repetido, secuencias consecutivas
  ascendentes/descendentes de 6+ caracteres tipo `abcdefgh` o `987654321`).
- **`passwordSchema`** (`src/lib/validation/auth.ts`): anade un
  `.refine(...)` que llama a `isCommonPassword`. Se aplica automaticamente
  a los tres flujos que ya reutilizaban este esquema sin cambios
  adicionales: registro (`registerSchema`), recuperacion de cuenta
  (`recoverSchema.newPassword`) y reclamacion de un participante
  provisional de Splitwise (`acceptInvitationSchema` en
  `src/lib/validation/groups.ts`).
- El resto de la politica ya estaba al dia (longitud minima/maxima sin
  reglas de composicion arbitrarias); esto cierra el ultimo punto
  pendiente del backlog de politica de contrasenas.
- Nuevo `src/lib/auth/common-passwords.test.ts` (5 tests). Verificado con
  `tsc --noEmit`, `next build` y `vitest run` (109/109).

## Notificaciones push (Web Push API)

- **Nuevas dependencias**: `web-push` (runtime) + `@types/web-push` (dev).
  Claves VAPID en `src/lib/env.ts` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
  `VAPID_SUBJECT`), deliberadamente opcionales a nivel de esquema (mismo
  criterio que las credenciales de Splitwise): si faltan, la app funciona
  igual sin push en vez de romper el build/arranque en entornos sin
  configurar. `src/lib/push/config.ts` (`isPushConfigured`/`getPushConfig`)
  centraliza esa comprobacion en tiempo de ejecucion.
- **Migracion `drizzle/0017_chubby_slyde.sql`**: nueva tabla
  `push_subscriptions` (`userId`, `endpoint` unico, `p256dh`/`auth`), una
  fila por dispositivo/navegador suscrito. Aplicada contra `.env.local`.
- **`src/lib/push/service.ts`**: `saveSubscription` (upsert por
  `endpoint`), `removeSubscription`, `hasActiveSubscription` y
  `sendPushToUser` (best-effort: nunca lanza; borra automaticamente las
  suscripciones que el navegador reporta como caducadas/revocadas,
  codigos 404/410).
- **Rutas**: `GET /api/push/config` (clave publica + si el usuario ya
  esta suscrito), `POST /api/push/subscribe`, `POST /api/push/unsubscribe`.
  Todas con `requireSession`.
- **Envio real**: `updateExpense` (`src/lib/expenses/service.ts`) y
  `recordSettlementPayment` (`src/lib/settlements/service.ts`) ahora
  llaman a `sendPushToUser` justo DESPUES de que la transaccion que crea
  la notificacion en BD ya se ha confirmado (nunca dentro de la
  transaccion: es una llamada de red best-effort que no debe poder afectar
  al guardado del gasto/pago ni a la auditoria). El contenido del push es
  deliberadamente generico ("Un gasto que creaste necesita tu validacion.",
  "Se ha registrado un pago en uno de tus grupos.") sin importes, nombres
  ni descripciones: la notificacion del sistema puede verse en la pantalla
  de bloqueo del dispositivo (Backlog: "contenido que no revele
  informacion sensible").
- **`public/sw.js`**: nuevos listeners `push` (muestra la notificacion con
  `showNotification`), `notificationclick` (enfoca una pestana existente o
  abre una nueva en la URL del grupo) y `pushsubscriptionchange`
  (reintento best-effort de resuscripcion si el navegador rota el
  endpoint).
- **Cliente**: `src/lib/push/use-push-subscription.ts` (hook que consulta
  `/api/push/config`, pide permiso y se suscribe/desuscribe explicitamente,
  nunca de forma automatica) integrado como un `DropdownMenuCheckboxItem`
  ("Notificaciones push en este dispositivo") en `NotificationsBell`. Se
  oculta por completo si el navegador no soporta Push API, si el entorno
  no tiene VAPID configurado, o fuera de produccion (el service worker
  solo se registra en produccion, mismo criterio que
  `ServiceWorkerRegister`).
- Verificado con `tsc --noEmit`, `next build` (rutas `/api/push/*`
  compiladas sin error), `pnpm db:generate`/`db:migrate` contra
  `.env.local` y `vitest run` (109/109, sin tests nuevos: la parte
  cubierta por tests unitarios preexistentes -formato de mensajes,
  paginacion de notificaciones- no cambia; el envio real de push requiere
  claves VAPID y un navegador real, fuera del alcance de Vitest).
