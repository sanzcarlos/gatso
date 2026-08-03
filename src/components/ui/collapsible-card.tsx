"use client";

import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

/**
 * Tarjeta plegable (Fase 10): envuelve `Card` con un `Collapsible` de
 * Radix para que las secciones de la pagina de un grupo/subgrupo
 * (Estadisticas, Liquidacion, Gastos, Miembros, Subgrupos...) empiecen
 * compactadas y solo muestren su contenido al pulsar la cabecera,
 * reduciendo el scroll inicial en pantallas moviles. El estado se puede
 * dejar sin controlar (por defecto cerrada, `defaultOpen`) o controlar
 * desde fuera (`open`/`onOpenChange`) cuando el padre necesita saber si
 * esta abierta (p. ej. para cargar datos solo la primera vez que se
 * despliega).
 */
export function CollapsibleCard({
  title,
  description,
  headerExtra,
  defaultOpen = false,
  open,
  onOpenChange,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Contenido extra en la cabecera (botones, badges) que no debe activar el toggle al pulsarlo. */
  headerExtra?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <CollapsiblePrimitive.Root
      defaultOpen={defaultOpen}
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange !== undefined ? { onOpenChange } : {})}
      asChild
    >
      <Card className={className}>
        <CollapsiblePrimitive.Trigger asChild>
          <CardHeader
            className="group flex-row items-center justify-between gap-2 cursor-pointer select-none transition-colors hover:bg-accent/40"
            role="button"
          >
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-base">{title}</CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
            <div className="flex items-center gap-1">
              {headerExtra ? (
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {headerExtra}
                </div>
              ) : null}
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </div>
          </CardHeader>
        </CollapsiblePrimitive.Trigger>
        <CollapsiblePrimitive.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          <CardContent>{children}</CardContent>
        </CollapsiblePrimitive.Content>
      </Card>
    </CollapsiblePrimitive.Root>
  );
}
