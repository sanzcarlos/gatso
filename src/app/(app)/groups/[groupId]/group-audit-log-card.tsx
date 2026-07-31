"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface AuditEntry {
  id: string;
  action: "create" | "update" | "delete";
  entityType: "expense" | "group" | "subgroup" | "membership" | "subgroup_membership" | string;
  actorUserId: string;
  actorAlias: string;
  createdAt: string;
  beforeData: { description?: string; name?: string } | null;
  afterData: { description?: string; name?: string; validated?: boolean } | null;
}

const ACTION_LABEL: Record<AuditEntry["action"], string> = {
  create: "Creado",
  update: "Editado",
  delete: "Borrado",
};

const ENTITY_LABEL: Record<string, string> = {
  expense: "gasto",
  group: "grupo",
  subgroup: "subgrupo",
  membership: "miembro del grupo",
  subgroup_membership: "miembro del subgrupo",
};

function describeEntry(entry: AuditEntry): string {
  const entityLabel = ENTITY_LABEL[entry.entityType] ?? entry.entityType;
  const label = entry.afterData?.description ?? entry.afterData?.name ?? entry.beforeData?.description ?? entry.beforeData?.name;

  if (entry.entityType === "expense" && entry.action === "update" && entry.afterData?.validated) {
    return `valido cambios pendientes en el gasto${label ? ` "${label}"` : ""}`;
  }
  if (entry.action === "create") return `anadio ${entityLabel}${label ? ` "${label}"` : ""}`;
  if (entry.action === "delete") return `elimino ${entityLabel}${label ? ` "${label}"` : ""}`;
  return `edito ${entityLabel}${label ? ` "${label}"` : ""}`;
}

/**
 * Historial de auditoria completo del grupo (Fase 5): todas las acciones
 * de create/update/delete sobre gastos, el propio grupo, subgrupos y
 * membresias, respaldadas por la tabla `audit_logs` (inmutable a nivel de
 * base de datos, ver migracion correspondiente). Visible solo para
 * administradores del grupo.
 */
export function GroupAuditLogCard({ groupId }: { groupId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    apiFetch(`/api/groups/${groupId}/audit-log`).then(async (response) => {
      if (!response.ok) {
        toast.error("No se pudo cargar el historial de auditoria");
        return;
      }
      const data = await response.json();
      setEntries(data.entries);
    });
  }, [groupId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Auditoria</CardTitle>
        <CardDescription>
          Registro inmutable de cambios en el grupo: gastos, subgrupos y miembros. Solo visible
          para administradores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries === null ? (
          <Skeleton className="h-24 w-full" />
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavia no hay eventos registrados.</p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start justify-between gap-2 rounded-md border border-border p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ACTION_LABEL[entry.action]}</Badge>
                    <span className="text-sm text-foreground">
                      <strong>{entry.actorAlias}</strong> {describeEntry(entry)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.createdAt).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
