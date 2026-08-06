"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/api/client-fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ArchivedGroup {
  id: string;
  name: string;
  inviteCode: string;
  archivedAt: string;
  createdAt: string;
}

/**
 * Grupos archivados porque su ultimo miembro los abandono (Backlog:
 * politica para grupos con cero miembros, ver `leaveGroup`). Un
 * administrador de plataforma puede restaurarlos aqui mientras siga
 * archivados; pasado el periodo de retencion configurado
 * (`archived_groups_retention_days` en `app_config`, 30 dias por
 * defecto), `cleanupArchivedGroups` los borra de forma definitiva.
 */
export default function AdminGroupsClient() {
  const [groups, setGroups] = useState<ArchivedGroup[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/groups");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo cargar la lista de grupos archivados");
      return;
    }
    const data = await response.json();
    setGroups(data.groups);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleRestore(group: ArchivedGroup) {
    setRestoringId(group.id);
    try {
      const response = await apiFetch(`/api/admin/groups/${group.id}/restore`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo restaurar el grupo");
        return;
      }
      toast.success("Grupo restaurado");
      await load();
    } finally {
      setRestoringId(null);
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Grupos archivados</h1>
        <Badge variant="outline">{groups?.length ?? 0} archivado{groups?.length === 1 ? "" : "s"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pendientes de eliminacion definitiva</CardTitle>
          <CardDescription>
            Se archivan automaticamente cuando su ultimo miembro los abandona: su codigo de invitacion
            deja de funcionar, pero conservan gastos y liquidaciones. Pasado el periodo de retencion se
            borran de forma definitiva; restaurarlos aqui los deja disponibles de nuevo con el mismo
            codigo (sin miembros, hay que volver a unirse).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groups === null ? (
            <Skeleton className="h-32 w-full" />
          ) : groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay grupos archivados actualmente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Codigo de invitacion</TableHead>
                  <TableHead>Archivado</TableHead>
                  <TableHead>Restaurar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell>{group.name}</TableCell>
                    <TableCell className="font-mono">{group.inviteCode}</TableCell>
                    <TableCell>{new Date(group.archivedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoringId === group.id}
                        onClick={() => handleRestore(group)}
                      >
                        {restoringId === group.id ? "Restaurando..." : "Restaurar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
