"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  isProvisional: boolean;
  isPlatformAdmin: boolean;
  createdAt: string;
}

interface AdminUsersClientProps {
  currentUserId: string;
}

export default function AdminUsersClient({ currentUserId }: AdminUsersClientProps) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/admin/users");
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo cargar la lista de usuarios");
      return;
    }
    const data = await response.json();
    setUsers(data.users);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const adminCount = users?.filter((u) => u.isPlatformAdmin).length ?? 0;

  async function handleToggleAdmin(user: AdminUser) {
    const nextIsAdmin = !user.isPlatformAdmin;
    const response = await apiFetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isPlatformAdmin: nextIsAdmin }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo actualizar el usuario");
      return;
    }
    toast.success(nextIsAdmin ? "Administrador de plataforma concedido" : "Administrador de plataforma revocado");
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Volver a administracion
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Administradores de plataforma</h1>
        <Badge variant="outline">{adminCount} administrador{adminCount === 1 ? "" : "es"}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuarios</CardTitle>
          <CardDescription>
            Conceder este rol da acceso a catalogos globales y auditoria de plataforma. No puedes
            revocar tu propio rol ni el del ultimo administrador restante.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users === null ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Nombre visible</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Administrador de plataforma</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isLastAdmin = user.isPlatformAdmin && adminCount <= 1;
                  const isSelf = user.id === currentUserId;
                  return (
                    <TableRow key={user.id}>
                      <TableCell className="font-mono">{user.username}</TableCell>
                      <TableCell>{user.displayName}</TableCell>
                      <TableCell>
                        {user.isProvisional ? <Badge variant="outline">Provisional</Badge> : "Normal"}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={user.isPlatformAdmin}
                          disabled={user.isPlatformAdmin && (isSelf || isLastAdmin)}
                          onCheckedChange={() => handleToggleAdmin(user)}
                          aria-label={`Conceder o revocar administrador de plataforma a ${user.username}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
