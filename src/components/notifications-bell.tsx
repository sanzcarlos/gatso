"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  type: "expense_pending_validation";
  groupId: string | null;
  expenseId: string | null;
  message: string;
  isRead: boolean;
  createdAt: string;
}

/**
 * Campana de notificaciones (Fase 4). Por ahora solo existe el tipo
 * "expense_pending_validation" (edicion de un gasto ajeno que requiere
 * validacion del creador original), pero el modelo es ampliable.
 */
export function NotificationsBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch("/api/notifications");
    if (response.ok) {
      const data = await response.json();
      setNotifications(data.notifications ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) await load();
  }

  async function handleMarkRead(notificationId: string) {
    const response = await apiFetch(`/api/notifications/${notificationId}`, { method: "PATCH" });
    if (!response.ok) {
      toast.error("No se pudo actualizar la notificacion");
      return;
    }
    await load();
  }

  async function handleMarkAllRead() {
    const response = await apiFetch("/api/notifications", { method: "PATCH" });
    if (!response.ok) {
      toast.error("No se pudieron marcar como leidas");
      return;
    }
    await load();
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificaciones" className="relative">
          <Bell />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]"
            >
              {unreadCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notificaciones
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-xs font-normal text-primary hover:underline"
            >
              Marcar todas como leidas
            </button>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">Sin notificaciones.</p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              className="flex flex-col items-start gap-1 whitespace-normal"
              onSelect={(event) => {
                event.preventDefault();
                if (!notification.isRead) handleMarkRead(notification.id);
              }}
            >
              {notification.groupId ? (
                <Link href={`/groups/${notification.groupId}`} className="w-full">
                  <NotificationBody notification={notification} />
                </Link>
              ) : (
                <NotificationBody notification={notification} />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationBody({ notification }: { notification: NotificationItem }) {
  return (
    <div className="flex w-full items-start gap-2">
      {!notification.isRead ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
      <div className="flex flex-col gap-0.5">
        <p className="text-sm text-foreground">{notification.message}</p>
        <span className="text-xs text-muted-foreground">{new Date(notification.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}
