# Sistema de diseno — Gatso

Documento de referencia para el sistema de diseno (Fase 2.5). Cubre stack
elegido, tokens, tema claro/oscuro, auditoria de contraste WCAG y catalogo
de componentes.

## Decision de stack: Tailwind CSS v4 (no v3)

El enunciado original describia el flujo clasico de Tailwind v3
(`tailwind.config.ts` + `postcss` + `autoprefixer` + `tailwindcss init -p`).
Verificado contra el registro de npm: la version **actual y unica
mantenida activamente es Tailwind CSS v4.3.3** (v3 esta en modo
mantenimiento). Tailwind v4 cambia el flujo de configuracion de forma
fundamental:

| Aspecto | Tailwind v3 (enunciado original) | Tailwind v4 (implementado) |
|---|---|---|
| Configuracion | `tailwind.config.ts` (JS/TS) | CSS-first: bloque `@theme` en `globals.css` |
| PostCSS | `postcss` + `tailwindcss` + `autoprefixer` como plugins separados | Un solo plugin `@tailwindcss/postcss` (incluye prefijado via Lightning CSS internamente) |
| CLI de init | `tailwindcss init -p` | No existe ese comando en v4 |
| Deteccion de contenido | `content: [...]` manual | Automatica (escanea el proyecto respetando `.gitignore`) |
| Animaciones (`animate-in`, etc.) | Plugin `tailwindcss-animate` | Sucesor oficial `tw-animate-css` |

**Decision**: usar Tailwind v4 real, no v3 simulado. Es la version vigente,
es la que usa shadcn/ui (explicitamente sugerido en el enunciado) en su
plantilla actual para Next.js, y mantiene coherencia con el resto del stack
del proyecto (Next 16, React 19, TS7) que ya usa siempre la ultima version
real disponible. Documentado aqui siguiendo el mismo criterio aplicado a
otras decisiones de esta naturaleza (`proxy.ts` en vez de `middleware.ts`,
driver `neon-serverless` en vez de `neon-http`, etc. — ver `PROGRESS.md`).

**Consecuencia**: no existe `tailwind.config.ts` en el repositorio. No es
una omision: en Tailwind v4 ese fichero es opcional y, para este proyecto,
innecesario — todos los tokens viven en `src/app/globals.css` (`@theme
inline`), que es la fuente unica de verdad. `autoprefixer` tampoco se
instala (Lightning CSS, integrado en `@tailwindcss/postcss`, ya prefija).

## Componentes: shadcn/ui (Radix UI + Tailwind), sin CLI

Se sigue el patron de codigo de shadcn/ui (copiar componentes tipados a
`src/components/ui/`, no una libreria instalada como dependencia opaca),
usando directamente los primitivos `@radix-ui/react-*` para accesibilidad
ARIA correcta out-of-the-box, `class-variance-authority` para variantes
tipadas y `tailwind-merge`/`clsx` (helper `cn()` en `src/lib/utils.ts`).
No se ejecuto el CLI oficial `shadcn init` (requiere red + pnpm, bloqueado
en el entorno de desarrollo de este proyecto, ver `PROGRESS.md`); los
componentes se escribieron a mano siguiendo el codigo fuente real y
publicado de shadcn/ui para cada primitivo.

## Tema claro/oscuro

- Libreria: `next-themes` (`src/components/theme-provider.tsx`), envuelto
  en `RootLayout` con `attribute="class"` — anade/quita `.dark` en
  `<html>`, leido por `@custom-variant dark` en `globals.css`.
- `defaultTheme="system"` + `enableSystem`: si el usuario no ha elegido
  nada, se respeta `prefers-color-scheme` del sistema operativo/navegador.
- La eleccion explicita del usuario (claro/oscuro/sistema) se persiste
  automaticamente en `localStorage` (clave `theme`) por `next-themes`; no
  se requiere codigo adicional.
- Selector visible: `src/components/theme-toggle.tsx`, un icono de sol/luna
  con menu desplegable (Claro / Oscuro / Sistema), presente en `SiteHeader`
  en todas las paginas (autenticadas y no autenticadas).
- `suppressHydrationWarning` en `<html>` (requerido por next-themes, ya
  que el atributo de clase se fija antes de la hidratacion de React).

## Tokens de diseno

Definidos en `src/app/globals.css` mediante variables CSS en `:root`
(modo claro) y `.dark` (modo oscuro), expuestas a Tailwind via `@theme
inline` para generar automaticamente utilidades (`bg-primary`,
`text-muted-foreground`, `rounded-lg`, etc.).

| Token | Uso |
|---|---|
| `background` / `foreground` | Fondo y texto por defecto de la pagina |
| `card` / `card-foreground` | Superficies elevadas (tarjetas) |
| `popover` / `popover-foreground` | Menus, dropdowns, contenido flotante |
| `primary` / `primary-hover` / `primary-foreground` | Accion principal (botones, enlaces destacados) |
| `secondary` / `secondary-foreground` | Accion secundaria, fondos sutiles |
| `muted` / `muted-foreground` | Texto de apoyo, fondos neutros (skeletons, avatares) |
| `accent` / `accent-foreground` | Resaltado de items activos/hover en menus |
| `destructive` / `destructive-hover` / `destructive-foreground` | Acciones peligrosas, errores |
| `success` / `success-foreground` | Confirmaciones, estados positivos |
| `warning` / `warning-foreground` | Avisos |
| `info` / `info-foreground` | Informacion neutra |
| `border` | Divisorias decorativas (no sujetas a 3:1, son cosmeticas) |
| `input` / `ring` | Limites de componentes interactivos y anillo de foco (SI sujetos a >=3:1, WCAG 1.4.11) |
| `radius` (`sm`/`md`/`lg`/`xl`) | Radios de borde consistentes |
| `shadow` (`sm`/`md`/`lg`) | Elevacion de tarjetas/modales |
| `font-sans` | Tipografia por defecto (system-ui) |

## Auditoria de contraste WCAG 2.1

Verificado con `scripts/check-contrast.mjs` (formula oficial de luminancia
relativa de WCAG 2.1, sin dependencias externas — ejecutar con
`node scripts/check-contrast.mjs`). Umbrales aplicados: **4.5:1** para
texto normal (AA), **3:1** para texto grande/negrita o componentes de UI
interactivos (AA), **7:1**/**4.5:1** respectivamente para AAA.

| Modo | Combinacion | Fondo | Texto | Ratio | Minimo AA | Resultado |
|---|---|---|---|---|---|---|
| Claro | background / foreground | `#f8fafc` | `#0f172a` | 17.06:1 | 4.5:1 | **AAA** |
| Claro | card / card-foreground | `#ffffff` | `#0f172a` | 17.85:1 | 4.5:1 | **AAA** |
| Claro | muted / muted-foreground | `#f1f5f9` | `#475569` | 6.92:1 | 4.5:1 | **AA** |
| Claro | primary / primary-foreground | `#4338ca` | `#ffffff` | 7.90:1 | 4.5:1 | **AAA** |
| Claro | secondary / secondary-foreground | `#eef2ff` | `#0f172a` | 15.97:1 | 4.5:1 | **AAA** |
| Claro | destructive / destructive-foreground | `#b91c1c` | `#ffffff` | 6.47:1 | 4.5:1 | **AA** |
| Claro | success / success-foreground | `#15803d` | `#ffffff` | 5.02:1 | 4.5:1 | **AA** |
| Claro | warning / warning-foreground | `#a16207` | `#ffffff` | 4.92:1 | 4.5:1 | **AA** |
| Claro | info / info-foreground | `#0369a1` | `#ffffff` | 5.93:1 | 4.5:1 | **AA** |
| Claro | input/ring (UI) / background | `#64748b` | `#f8fafc` | 4.55:1 | 3:1 | **AAA** |
| Claro | accent / accent-foreground | `#e0e7ff` | `#3730a3` | 8.06:1 | 4.5:1 | **AAA** |
| Oscuro | background / foreground | `#090d14` | `#f1f5f9` | 17.76:1 | 4.5:1 | **AAA** |
| Oscuro | card / card-foreground | `#111722` | `#f1f5f9` | 16.39:1 | 4.5:1 | **AAA** |
| Oscuro | muted / muted-foreground | `#1e293b` | `#94a3b8` | 5.71:1 | 4.5:1 | **AA** |
| Oscuro | primary / primary-foreground | `#818cf8` | `#090d14` | 6.52:1 | 4.5:1 | **AA** |
| Oscuro | secondary / secondary-foreground | `#1e293b` | `#f1f5f9` | 13.35:1 | 4.5:1 | **AAA** |
| Oscuro | destructive / destructive-foreground | `#f87171` | `#090d14` | 7.03:1 | 4.5:1 | **AAA** |
| Oscuro | success / success-foreground | `#4ade80` | `#090d14` | 11.17:1 | 4.5:1 | **AAA** |
| Oscuro | warning / warning-foreground | `#fbbf24` | `#090d14` | 11.66:1 | 4.5:1 | **AAA** |
| Oscuro | info / info-foreground | `#38bdf8` | `#090d14` | 9.08:1 | 4.5:1 | **AAA** |
| Oscuro | input/ring (UI) / background | `#64748b` | `#090d14` | 4.09:1 | 3:1 | **AA** |
| Oscuro | accent / accent-foreground | `#312e81` | `#c7d2fe` | 7.66:1 | 4.5:1 | **AAA** |

**Resultado**: las 22 combinaciones cumplen AA; 14 de ellas alcanzan AAA.
Ninguna combinacion usada en la interfaz esta por debajo del minimo AA.

### Iteraciones realizadas (color que fallo y se corrigio)

El token `border` inicial elegido para "limites de componentes
interactivos" (`#cbd5e1` en claro / `#334155` en oscuro, tipicos grises de
borde sutil) **fallo** el umbral de 3:1 (ratios de 1.48:1 y 1.86:1
respectivamente) al medirlo con el script. Se sustituyo por `#64748b`
(slate-500) en ambos modos, que sí supera 3:1 en los dos fondos, y se
volvio a verificar con `check-contrast.mjs` antes de usarlo en produccion.
Como consecuencia se separaron dos tokens distintos:

- `border`: divisorias puramente decorativas (lineas entre filas de tabla,
  separadores) — no sujeto al requisito de 3:1 porque WCAG 1.4.11
  (Non-text Contrast) aplica a los limites de **componentes de interfaz e
  indicadores de estado**, no a divisores cosmeticos sin funcion.
- `input` / `ring`: limites de campos de formulario y anillos de foco —
  estos SI son un requisito de accesibilidad real y usan `#64748b`,
  verificado >=3:1 en ambos modos.

## Catalogo de componentes (`src/components/ui/`)

| Componente | Base | Notas de accesibilidad |
|---|---|---|
| `Button` | CVA + `@radix-ui/react-slot` (`asChild`) | Foco visible (`focus-visible:ring-2`), variantes `default/destructive/outline/secondary/ghost/link`, tamanos `sm/default/lg/icon` |
| `Input` | HTML nativo | `aria-invalid` cambia el color de borde automaticamente |
| `Label` | `@radix-ui/react-label` | Asociacion nativa con `htmlFor` |
| `Select` | `@radix-ui/react-select` | Navegable por teclado, `aria-*` gestionados por Radix |
| `Card` (+ Header/Title/Description/Content/Footer) | Div semantico | — |
| `Dialog` (Modal) | `@radix-ui/react-dialog` | Focus trap, `Escape` para cerrar, `aria-modal`, retorna el foco al cerrar (gestionado por Radix) |
| `Badge` | CVA | Variantes `default/secondary/destructive/success/warning/info/outline` |
| `Avatar` | `@radix-ui/react-avatar` | Fallback accesible con iniciales |
| `Switch` (Toggle) | `@radix-ui/react-switch` | Rol `switch` nativo, estado anunciado por lectores de pantalla |
| `DropdownMenu` | `@radix-ui/react-dropdown-menu` | Navegacion por teclado (flechas, Home/End), cierre con `Escape` |
| `Table` (+ Header/Body/Row/Head/Cell) | Elementos `<table>` nativos | Estructura semantica real, no divs |
| `Skeleton` | Div con `animate-pulse` | Placeholder de carga |
| `Toaster` (Toast) | `sonner` | Anuncios no bloqueantes; tema sincronizado con `next-themes` |

Todos los componentes interactivos son accesibles por teclado (orden de
tabulacion natural del DOM, sin `tabIndex` manual salvo lo que gestionan
los primitivos de Radix) y muestran un anillo de foco visible
(`:focus-visible` global en `globals.css` + utilidades `focus-visible:*`
especificas por componente).

## Auditoria automatica de accesibilidad (Lighthouse / axe-core)

**Pendiente de ejecucion real.** Requiere `pnpm build && pnpm start` (o
`pnpm dev`) y un navegador/Chrome headless, ninguno disponible en el
entorno de desarrollo usado para escribir esta fase (`pnpm` bloqueado por
politica de grupo, ver `PROGRESS.md`). Instrucciones para ejecutarla en un
entorno sin esa restriccion:

```bash
pnpm build && pnpm start &
npx -y lighthouse http://localhost:3000 --only-categories=accessibility --view
# o, con Chrome instalado, desde DevTools > Lighthouse > Accessibility
```

Objetivo: puntuacion >= 90. Dado que se han usado primitivos Radix
(landmarks, roles y estados ARIA correctos out-of-the-box), HTML semantico
(`<table>` reales, `<label htmlFor>`, `<button>` reales en vez de `<div
onClick>`) y contraste verificado matematicamente >= AA en todas las
combinaciones, es razonable esperar que se alcance el objetivo, pero esto
**no sustituye la ejecucion real** — queda anotado como pendiente de
verificacion en `PROGRESS.md`.
