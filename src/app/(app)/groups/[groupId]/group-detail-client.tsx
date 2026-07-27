"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface GroupDetail {
  group: { id: string; name: string; inviteCode: string; maxMembers: number; maxSubgroups: number };
  memberCount: number;
  subgroupCount: number;
}

interface Member {
  userId: string;
  alias: string;
  role: "admin" | "member";
}

interface Subgroup {
  id: string;
  name: string;
}

export default function GroupDetailClient({
  groupId,
  currentUserId,
}: {
  groupId: string;
  currentUserId: string;
}) {
  const [detail, setDetail] = useState<GroupDetail | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [subgroups, setSubgroups] = useState<Subgroup[] | null>(null);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [creatingSubgroup, setCreatingSubgroup] = useState(false);

  const isAdmin = members?.find((m) => m.userId === currentUserId)?.role === "admin";

  const load = useCallback(async () => {
    const [detailRes, membersRes, subgroupsRes] = await Promise.all([
      apiFetch(`/api/groups/${groupId}`),
      apiFetch(`/api/groups/${groupId}/members`),
      apiFetch(`/api/groups/${groupId}/subgroups`),
    ]);
    if (detailRes.ok) setDetail(await detailRes.json());
    if (membersRes.ok) setMembers((await membersRes.json()).members);
    if (subgroupsRes.ok) setSubgroups((await subgroupsRes.json()).subgroups);
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreateSubgroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingSubgroup(true);
    try {
      const response = await apiFetch(`/api/groups/${groupId}/subgroups`, {
        method: "POST",
        body: JSON.stringify({ name: newSubgroupName }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo crear el subgrupo");
        return;
      }
      setNewSubgroupName("");
      toast.success("Subgrupo creado");
      await load();
    } finally {
      setCreatingSubgroup(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    const response = await apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      toast.error(data.error ?? "No se pudo eliminar al miembro");
      return;
    }
    toast.success("Miembro eliminado");
    await load();
  }

  if (!detail) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{detail.group.name}</h1>
        <Badge variant="outline" className="font-mono text-sm">
          {detail.group.inviteCode}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {detail.memberCount} / {detail.group.maxMembers} miembros · {detail.subgroupCount} /{" "}
        {detail.group.maxSubgroups} subgrupos
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Miembros</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Alias</TableHead>
                <TableHead>Rol</TableHead>
                {isAdmin ? <TableHead className="text-right">Acciones</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members?.map((member) => (
                <TableRow key={member.userId}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarFallback>{member.alias.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      {member.alias}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                      {member.role === "admin" ? "Administrador" : "Miembro"}
                    </Badge>
                  </TableCell>
                  {isAdmin ? (
                    <TableCell className="text-right">
                      {member.userId !== currentUserId ? (
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member.userId)}>
                          Eliminar
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subgrupos</CardTitle>
          <CardDescription>Cualquier miembro del grupo puede crear subgrupos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {subgroups && subgroups.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {subgroups.map((subgroup) => (
                <li key={subgroup.id}>
                  <Badge variant="outline">{subgroup.name}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Todavia no hay subgrupos.</p>
          )}
        </CardContent>
        <form onSubmit={handleCreateSubgroup}>
          <CardContent className="flex flex-col gap-2 pt-0">
            <Label htmlFor="new-subgroup-name">Nuevo subgrupo</Label>
            <div className="flex gap-2">
              <Input
                id="new-subgroup-name"
                value={newSubgroupName}
                onChange={(e) => setNewSubgroupName(e.target.value)}
                placeholder="Fin de semana"
                maxLength={64}
                required
              />
              <Button type="submit" disabled={creatingSubgroup}>
                {creatingSubgroup ? "Creando..." : "Crear"}
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
