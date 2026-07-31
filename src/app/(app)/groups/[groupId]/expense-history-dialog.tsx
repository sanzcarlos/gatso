"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

interface HistoryEntry {
  id: string;
  action: "create" | "update" | "delete";
  actorUserId: string;
  actorAlias: string;
  createdAt: string;
  beforeData: unknown;
  afterData: { validated?: boolean } | null;
}

const ACTION_LABEL: Record<HistoryEntry["action"], string> = {
  create: "Creado",
  update: "Editado",
  delete: "Borrado",
};

function describeEntry(entry: HistoryEntry): string {
  if (entry.action === "update" && entry.afterData && (entry.afterData as { validated?: boolean }).validated) {
    return "valido los cambios pendientes";
  }
  if (entry.action === "create") return "creo el gasto";
  if (entry.action === "delete") return "borro el gasto";
  return "edito el gasto";
}

export function ExpenseHistoryDialog({ groupId, expenseId }: { groupId: string; expenseId: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    apiFetch(`/api/groups/${groupId}/expenses/${expenseId}/history`).then(async (response) => {
      if (!response.ok) {
        toast.error("No se pudo cargar el historial");
        return;
      }
      const data = await response.json();
      setHistory(data.history);
    });
  }, [open, groupId, expenseId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Ver historial del gasto">
          <History />
          Historial
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial del gasto</DialogTitle>
          <DialogDescription>Todos los cambios registrados para este gasto, mas recientes primero.</DialogDescription>
        </DialogHeader>
        {history === null ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registros de historial.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-3">
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
      </DialogContent>
    </Dialog>
  );
}
