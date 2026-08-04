"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bug } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AuditEntry {
  id: string;
  action: "create" | "update" | "delete";
  entityType: "expense" | "group" | "subgroup" | "membership" | "subgroup_membership" | string;
  actorUserId: string;
  actorDisplayName: string;
  createdAt: string;
  beforeData: { description?: string; name?: string; leftVoluntarily?: boolean } | null;
  afterData: { description?: string; name?: string; validated?: boolean; role?: string } | null;
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
  currency: "moneda",
  settlement_payment: "pago de liquidacion",
};

const ENTITY_TYPE_OPTIONS = Object.keys(ENTITY_LABEL);

function describeEntry(entry: AuditEntry): string {
  const entityLabel = ENTITY_LABEL[entry.entityType] ?? entry.entityType;
  const label = entry.afterData?.description ?? entry.afterData?.name ?? entry.beforeData?.description ?? entry.beforeData?.name;

  if (entry.entityType === "expense" && entry.action === "update" && entry.afterData?.validated) {
    return `valido cambios pendientes en el gasto${label ? ` "${label}"` : ""}`;
  }
  if (entry.entityType === "membership" && entry.action === "delete" && entry.beforeData?.leftVoluntarily) {
    return "abandono el grupo";
  }
  if (entry.entityType === "membership" && entry.action === "update" && entry.afterData?.role === "admin") {
    return "fue ascendido a administrador del grupo (el anterior administrador abandono el grupo)";
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
 *
 * Oculto por defecto (Fase 10): al no ser una vista de uso habitual, se
 * mantiene colapsado hasta que el administrador pulsa el icono de
 * "bug"/depuracion, y solo entonces se hace la peticion a la API (evita
 * cargar el historial completo en cada visita a la pagina del grupo).
 */
export function GroupAuditLogCard({ groupId }: { groupId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>("all");

  function buildUrl(action: string, entityType: string, cursor?: string | null) {
    const searchParams = new URLSearchParams();
    if (action !== "all") searchParams.set("action", action);
    if (entityType !== "all") searchParams.set("entityType", entityType);
    if (cursor) searchParams.set("cursor", cursor);
    const query = searchParams.toString();
    return `/api/groups/${groupId}/audit-log${query ? `?${query}` : ""}`;
  }

  async function loadEntries(action: string, entityType: string) {
    const response = await apiFetch(buildUrl(action, entityType));
    if (!response.ok) {
      toast.error("No se pudo cargar el historial de auditoria");
      return;
    }
    const data = await response.json();
    setEntries(data.entries);
    setNextCursor(data.nextCursor ?? null);
  }

  async function handleOpenChange(open: boolean) {
    if (!open || entries !== null) return;
    await loadEntries(actionFilter, entityTypeFilter);
  }

  async function handleActionFilterChange(value: string) {
    setActionFilter(value);
    await loadEntries(value, entityTypeFilter);
  }

  async function handleEntityTypeFilterChange(value: string) {
    setEntityTypeFilter(value);
    await loadEntries(actionFilter, value);
  }

  async function handleLoadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await apiFetch(buildUrl(actionFilter, entityTypeFilter, nextCursor));
      if (!response.ok) {
        toast.error("No se pudo cargar el historial de auditoria");
        return;
      }
      const data = await response.json();
      setEntries((current) => [...(current ?? []), ...data.entries]);
      setNextCursor(data.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <CollapsibleCard
      title="Auditoria"
      description="Registro inmutable de cambios en el grupo: gastos, subgrupos y miembros. Solo visible para administradores."
      headerExtra={<Bug className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      onOpenChange={handleOpenChange}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={actionFilter} onValueChange={handleActionFilterChange}>
          <SelectTrigger className="w-40" aria-label="Filtrar por accion">
            <SelectValue placeholder="Accion" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las acciones</SelectItem>
            <SelectItem value="create">Creado</SelectItem>
            <SelectItem value="update">Editado</SelectItem>
            <SelectItem value="delete">Borrado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={entityTypeFilter} onValueChange={handleEntityTypeFilterChange}>
          <SelectTrigger className="w-48" aria-label="Filtrar por tipo de entidad">
            <SelectValue placeholder="Tipo de entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {ENTITY_TYPE_OPTIONS.map((type) => (
              <SelectItem key={type} value={type}>
                {ENTITY_LABEL[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {entries === null ? (
        <Skeleton className="h-24 w-full" />
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavia no hay eventos registrados.</p>
      ) : (
        <>
          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ACTION_LABEL[entry.action]}</Badge>
                    <span className="text-sm text-foreground">
                      <strong>{entry.actorDisplayName}</strong> {describeEntry(entry)}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
          {nextCursor ? (
            <div className="mt-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                {loadingMore ? "Cargando..." : "Cargar mas"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </CollapsibleCard>
  );
}
