"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AuditEntry {
  id: string;
  action: "create" | "update" | "delete";
  entityType: "currency" | "user" | string;
  entityId: string;
  actorUserId: string;
  actorDisplayName: string;
  createdAt: string;
  beforeData: { name?: string; isActive?: boolean; isPlatformAdmin?: boolean } | null;
  afterData: { name?: string; isActive?: boolean; isPlatformAdmin?: boolean } | null;
}

const ACTION_LABEL: Record<AuditEntry["action"], string> = {
  create: "Creado",
  update: "Editado",
  delete: "Borrado",
};

const ENTITY_LABEL: Record<string, string> = {
  currency: "moneda",
  user: "usuario",
};

const ENTITY_TYPE_OPTIONS = Object.keys(ENTITY_LABEL);

function describeEntry(entry: AuditEntry): string {
  const entityLabel = ENTITY_LABEL[entry.entityType] ?? entry.entityType;
  const label = entry.afterData?.name ?? entry.beforeData?.name ?? entry.entityId;

  if (entry.entityType === "user" && typeof entry.afterData?.isPlatformAdmin === "boolean") {
    return entry.afterData.isPlatformAdmin
      ? `concedio el rol de administrador de plataforma a ${label}`
      : `revoco el rol de administrador de plataforma a ${label}`;
  }
  if (entry.entityType === "currency" && typeof entry.afterData?.isActive === "boolean") {
    return entry.afterData.isActive ? `activo la moneda ${label}` : `desactivo la moneda ${label}`;
  }
  if (entry.action === "create") return `anadio ${entityLabel} "${label}"`;
  if (entry.action === "delete") return `elimino ${entityLabel} "${label}"`;
  return `edito ${entityLabel} "${label}"`;
}

/**
 * Historial de auditoria de entidades globales (Fase 6: monedas; ahora
 * tambien concesion/revocacion de administradores de plataforma). Misma
 * fuente que `GroupAuditLogCard` (`GET /api/admin/audit-log`, paginado
 * por cursor y filtrable), pero como pantalla propia en vez de tarjeta
 * colapsable: a diferencia de la auditoria de un grupo, esta vista no
 * tiene una pagina "padre" natural donde anidarla.
 */
export default function AdminAuditLogClient() {
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
    return `/api/admin/audit-log${query ? `?${query}` : ""}`;
  }

  const loadEntries = useCallback(async (action: string, entityType: string) => {
    const response = await apiFetch(buildUrl(action, entityType));
    if (!response.ok) {
      toast.error("No se pudo cargar el historial de auditoria");
      return;
    }
    const data = await response.json();
    setEntries(data.entries);
    setNextCursor(data.nextCursor ?? null);
  }, []);

  useEffect(() => {
    loadEntries(actionFilter, entityTypeFilter);
  }, [loadEntries, actionFilter, entityTypeFilter]);

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
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Volver a administracion
        </Link>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">Auditoria de plataforma</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial</CardTitle>
          <CardDescription>
            Registro inmutable de cambios sobre catalogos y roles globales: monedas y administradores de
            plataforma. No incluye eventos de un grupo concreto (ver la auditoria del propio grupo para eso).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Select value={actionFilter} onValueChange={setActionFilter}>
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
            <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
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
            <Skeleton className="h-32 w-full" />
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavia no hay eventos registrados.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
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
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Cargando..." : "Cargar mas"}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
