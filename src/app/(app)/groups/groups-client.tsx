"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { getCache, setCache } from "@/lib/offline/db";
import { OfflineBanner } from "@/components/offline-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

interface GroupRow {
  group: { id: string; name: string; inviteCode: string };
  role: "admin" | "member";
}

const GROUPS_CACHE_KEY = "groups-list";

export default function GroupsClient() {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  async function loadGroups() {
    try {
      const response = await apiFetch("/api/groups");
      if (response.ok) {
        const data = await response.json();
        setGroups(data.groups as GroupRow[]);
        setOffline(false);
        await setCache(GROUPS_CACHE_KEY, data.groups as GroupRow[]);
      }
    } catch {
      const cached = await getCache<GroupRow[]>(GROUPS_CACHE_KEY);
      if (cached) setGroups(cached);
      setOffline(true);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const response = await apiFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({ name: newGroupName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear el grupo");
        return;
      }
      setNewGroupName("");
      toast.success("Grupo creado");
      await loadGroups();
    } catch {
      toast.error("Sin conexion: no se pueden crear grupos sin conexion");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoining(true);
    try {
      const response = await apiFetch("/api/groups/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo unir al grupo");
        return;
      }
      setInviteCode("");
      toast.success("Te has unido al grupo");
      await loadGroups();
    } catch {
      toast.error("Sin conexion: no te puedes unir a un grupo sin conexion");
    } finally {
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Mis grupos</h1>

      {offline ? <OfflineBanner hasCachedData={groups !== null} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Crear grupo</CardTitle>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Label htmlFor="new-group-name">Nombre del grupo</Label>
                <Input
                  id="new-group-name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Viaje a la playa"
                  maxLength={64}
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={creating}>
                {creating ? "Creando..." : "Crear"}
              </Button>
            </CardFooter>
          </form>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Unirme a un grupo</CardTitle>
          </CardHeader>
          <form onSubmit={handleJoin}>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-code">Codigo de invitacion</Label>
                <Input
                  id="invite-code"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  placeholder="ABCD123456"
                  required
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="secondary" disabled={joining}>
                {joining ? "Uniendome..." : "Unirme"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Grupos</h2>
        {groups === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavia no perteneces a ningun grupo.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map(({ group, role }) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`}>
                  <Card className="transition-colors hover:bg-accent/50">
                    <CardContent className="flex items-center justify-between p-4">
                      <span className="font-medium text-foreground">{group.name}</span>
                      <Badge variant={role === "admin" ? "default" : "secondary"}>
                        {role === "admin" ? "Administrador" : "Miembro"}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
