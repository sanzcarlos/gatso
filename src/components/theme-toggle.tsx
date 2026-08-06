"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Selector de tema claro/oscuro como switch con iconos de sol/luna.
 * Usa next-themes: sin eleccion explicita se respeta siempre el tema del
 * sistema (`defaultTheme="system"` en ThemeProvider); al interactuar con el
 * switch se fija explicitamente "light" u "dark" (se persiste en
 * localStorage por next-themes).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <SwitchPrimitive.Root
      checked={isDark}
      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
      aria-label="Cambiar tema claro/oscuro"
      className={cn(
        "peer relative inline-flex h-7 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      )}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-between px-1.5">
        <Sun
          className={cn(
            "h-3.5 w-3.5 transition-opacity",
            isDark ? "opacity-40 text-primary-foreground" : "opacity-100 text-background",
          )}
        />
        <Moon
          className={cn(
            "h-3.5 w-3.5 transition-opacity",
            isDark ? "opacity-100 text-primary-foreground" : "opacity-40 text-background",
          )}
        />
      </span>
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none relative z-10 block h-6 w-6 rounded-full bg-background shadow-md transition-transform",
          "data-[state=checked]:translate-x-7 data-[state=unchecked]:translate-x-0.5",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
