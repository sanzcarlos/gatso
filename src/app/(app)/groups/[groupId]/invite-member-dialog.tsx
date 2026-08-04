"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus, Copy, Trash2 } from "lucide-react";

interface Invitation {
  id: string;
  token: string;
  suggestedDisplayName: string | null;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export function InviteMemberDialog({
  groupId,
  initialSuggestedDisplayName = "",
  triggerLabel = "Invitar",
}: {
  groupId: string;
  /** Prellena el campo "nombre sugerido" al abrir el dialogo (ej. participante de Splitwise sin cuenta Gatso, Fase 11). */
  initialSuggestedDisplayName?: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [suggestedDisplayName, setSuggestedDisplayName] = useState(initialSuggestedDisplayName);

  const load = useCallback(async () => {
    const response = await apiFetch(`/api/groups/${groupId}/invitations`);
    if (response.ok) {
      const data = await response.json();
      setInvitations(data.invitations ?? []);
    }
  }, [groupId]);

  useEffect(() => {
    if (open) {
      load();
      setSuggestedDisplayName(initialSuggestedDisplayName);
    }
  }, [open, load, initialSuggestedDisplayName]);

  function inviteUrl(token: string) {
    return `${window.location.origin}/invite/${token}`;
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/invitations`, {
        method: "POST",
        body: JSON.stringify({ suggestedDisplayName: suggestedDisplayName.trim() || undefined }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear la invitacion");
        return;
      }
      const data = await response.json();
      await navigator.clipboard.writeText(inviteUrl(data.invitation.token)).catch(() => {});
      toast.success("Enlace de invitacion copiado al portapapeles");
      setSuggestedDisplayName("");
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(inviteUrl(token)).catch(() => {});
    toast.success("Enlace copiado");
  }

  async function handleRevoke(invitationId: string) {
    if (!window.confirm("¿Eliminar esta invitacion pendiente? El enlace dejara de funcionar.")) {
      return;
    }
    setRevokingId(invitationId);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/invitations/${invitationId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo eliminar la invitacion");
        return;
      }
      toast.success("Invitacion eliminada");
      await load();
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitar a alguien nuevo</DialogTitle>
          <DialogDescription>
            Genera un enlace unico para que una persona sin cuenta cree su usuario y contrasena y se
            una directamente a este grupo. Cada enlace caduca a las 24 horas y solo puede usarse
            una vez.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-suggested-display-name">Nombre sugerido (opcional)</Label>
          <Input
            id="invite-suggested-display-name"
            value={suggestedDisplayName}
            onChange={(e) => setSuggestedDisplayName(e.target.value)}
            placeholder="Ej. Ana"
            maxLength={64}
          />
          <p className="text-xs text-muted-foreground">
            Se mostrara prellenado -pero editable- en el formulario que vera la persona invitada.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {invitations === null ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {invitations.map((invitation) => {
                const expired = new Date(invitation.expiresAt).getTime() < Date.now();
                return (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-2"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={expired ? "outline" : "secondary"}>
                          {expired ? "Caducada" : "Pendiente"}
                        </Badge>
                        {invitation.suggestedDisplayName ? (
                          <span className="text-xs font-medium text-foreground">{invitation.suggestedDisplayName}</span>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Caduca: {new Date(invitation.expiresAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!expired ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopy(invitation.token)}
                          aria-label="Copiar enlace de invitacion"
                        >
                          <Copy />
                          Copiar
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRevoke(invitation.id)}
                        disabled={revokingId === invitation.id}
                        aria-label="Eliminar invitacion"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 />
                        {revokingId === invitation.id ? "Eliminando..." : "Eliminar"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Generando..." : "Generar nuevo enlace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
