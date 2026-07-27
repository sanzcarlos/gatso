"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Envoltorio sobre next-themes. `attribute="class"` anade/quita ".dark" en
 * <html> (leido por el `@custom-variant dark` de globals.css).
 * `defaultTheme="system"` respeta `prefers-color-scheme` cuando el usuario
 * no ha elegido nada todavia; la eleccion explicita se persiste en
 * localStorage (clave "theme") automaticamente por next-themes.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem {...props}>
      {children}
    </NextThemesProvider>
  );
}
