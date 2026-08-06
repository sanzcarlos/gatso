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
| `primary` / `primary-hover` / `primary-foreground` | Superficie pastel de la accion principal y su tinta interna |
| `primary-ink` | Enlaces, iconos y texto principal sobre fondos de pagina/tarjeta |
| `secondary` / `secondary-foreground` | Accion secundaria, fondos sutiles |
| `muted` / `muted-foreground` | Texto de apoyo, fondos neutros (skeletons, avatares) |
| `accent` / `accent-foreground` | Resaltado de items activos/hover en menus |
| `destructive` / `destructive-hover` / `destructive-foreground` / `destructive-ink` | Superficie rosa pastel, tinta interna y tinta externa para errores |
| `success` / `success-foreground` / `success-ink` | Superficie verde pastel y tintas para estados positivos |
| `warning` / `warning-foreground` / `warning-ink` | Superficie amarilla pastel y tintas para avisos |
| `info` / `info-foreground` / `info-ink` | Superficie azul pastel y tintas informativas |
| `border` | Divisorias decorativas (no sujetas a 3:1, son cosmeticas) |
| `input` / `ring` | Limites interactivos y foco; objetivo AAA >=4.5:1 (WCAG 1.4.11 exige AA >=3:1) |
| `overlay` | Capa oscura semitransparente bajo dialogos modales |
| `radius` (`sm`/`md`/`lg`/`xl`) | Radios de borde consistentes |
| `shadow` (`sm`/`md`/`lg`) | Elevacion de tarjetas/modales |
| `font-sans` | Tipografia por defecto (system-ui) |

## Auditoria de contraste WCAG 2.1

Verificado con `scripts/check-contrast.mjs` (formula oficial de luminancia
relativa de WCAG 2.1, sin dependencias externas — ejecutar con
`node scripts/check-contrast.mjs`). La auditoria se ha endurecido para que
falle si cualquier pareja queda por debajo de **AAA**: 7:1 para texto
normal y 4.5:1 para texto grande o componentes de interfaz.

### Paleta pastel semantica

Los tonos pastel se usan como superficies y siempre se combinan con una
"tinta" profunda. Los tokens `*-ink` evitan utilizar un pastel claro como
texto sobre otra superficie clara. En modo oscuro, esas tintas externas
pasan a su variante pastel luminosa.

| Familia | Superficie pastel | Tinta interna | Tinta externa (claro / oscuro) |
|---|---|---|---|
| Lavanda principal | `#c9c2f0` | `#211a44` | `#514585` / `#c9c2f0` |
| Lavanda secundaria | `#e8def8` | `#2f2147` | — |
| Aqua de acento | `#d9edf0` | `#173f46` | — |
| Rosa destructivo | `#f4c7c3` | `#571414` | `#571414` / `#f4c7c3` |
| Verde de exito | `#c9e8d1` | `#153b21` | `#153b21` / `#c9e8d1` |
| Amarillo de aviso | `#f3dfad` | `#513800` | `#513800` / `#f3dfad` |
| Azul informativo | `#cbe4f4` | `#153c57` | `#153c57` / `#cbe4f4` |

| Modo | Combinacion | Fondo | Texto | Ratio | Resultado |
|---|---|---|---|---|---|
| Claro | background / foreground | `#fbfaf4` | `#25223a` | 14.67:1 | **AAA** |
| Claro | card / card-foreground | `#fffdf8` | `#25223a` | 15.09:1 | **AAA** |
| Claro | muted / muted-foreground | `#f1e9e2` | `#453d52` | 8.57:1 | **AAA** |
| Claro | primary / primary-foreground | `#c9c2f0` | `#211a44` | 9.61:1 | **AAA** |
| Claro | primary-hover / primary-foreground | `#b8afe8` | `#211a44` | 7.98:1 | **AAA** |
| Claro | background / primary-ink | `#fbfaf4` | `#514585` | 7.91:1 | **AAA** |
| Claro | secondary / secondary-foreground | `#e8def8` | `#2f2147` | 11.36:1 | **AAA** |
| Claro | accent / accent-foreground | `#d9edf0` | `#173f46` | 9.44:1 | **AAA** |
| Claro | destructive / destructive-foreground | `#f4c7c3` | `#571414` | 9.11:1 | **AAA** |
| Claro | destructive-hover / destructive-foreground | `#eab0ad` | `#571414` | 7.46:1 | **AAA** |
| Claro | success / success-foreground | `#c9e8d1` | `#153b21` | 9.50:1 | **AAA** |
| Claro | warning / warning-foreground | `#f3dfad` | `#513800` | 8.34:1 | **AAA** |
| Claro | info / info-foreground | `#cbe4f4` | `#153c57` | 8.78:1 | **AAA** |
| Claro | input (UI) / background | `#665a8f` | `#fbfaf4` | 5.87:1 | **AAA UI** |
| Claro | ring (UI) / background | `#5b4b8a` | `#fbfaf4` | 7.13:1 | **AAA UI** |
| Oscuro | background / foreground | `#171521` | `#f7f1f5` | 16.18:1 | **AAA** |
| Oscuro | card / card-foreground | `#211e2d` | `#f7f1f5` | 14.64:1 | **AAA** |
| Oscuro | muted / muted-foreground | `#2a2734` | `#d7cedd` | 9.57:1 | **AAA** |
| Oscuro | primary / primary-foreground | `#c9c2f0` | `#211a44` | 9.61:1 | **AAA** |
| Oscuro | primary-hover / primary-foreground | `#ddd8f7` | `#211a44` | 11.76:1 | **AAA** |
| Oscuro | background / primary-ink | `#171521` | `#c9c2f0` | 10.69:1 | **AAA** |
| Oscuro | secondary / secondary-foreground | `#302b3d` | `#f7f1f5` | 12.25:1 | **AAA** |
| Oscuro | accent / accent-foreground | `#d9edf0` | `#173f46` | 9.44:1 | **AAA** |
| Oscuro | destructive / destructive-foreground | `#f4c7c3` | `#571414` | 9.11:1 | **AAA** |
| Oscuro | destructive-hover / destructive-foreground | `#eab0ad` | `#571414` | 7.46:1 | **AAA** |
| Oscuro | success / success-foreground | `#c9e8d1` | `#153b21` | 9.50:1 | **AAA** |
| Oscuro | warning / warning-foreground | `#f3dfad` | `#513800` | 8.34:1 | **AAA** |
| Oscuro | info / info-foreground | `#cbe4f4` | `#153c57` | 8.78:1 | **AAA** |
| Oscuro | input (UI) / background | `#a99cbd` | `#171521` | 7.02:1 | **AAA UI** |
| Oscuro | ring (UI) / background | `#c9c2f0` | `#171521` | 10.69:1 | **AAA UI** |

Las parejas de tinta externa de estados (`success-ink`, `warning-ink`,
`info-ink` y `destructive-ink`) tambien se verifican en el script; sus
ratios oscilan entre 10.48:1 y 13.70:1. En total se comprueban 38 parejas
y todas alcanzan AAA.

`border` queda reservado a divisorias cosmeticas. `input` y `ring` se
usan en limites interactivos y foco, y ambos superan el umbral AAA de
4.5:1 para componentes de interfaz en claro y oscuro.

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
onClick>`) y contraste verificado matematicamente AAA en todas las
combinaciones, es razonable esperar que se alcance el objetivo, pero esto
**no sustituye la ejecucion real** — queda anotado como pendiente de
verificacion en `PROGRESS.md`.
