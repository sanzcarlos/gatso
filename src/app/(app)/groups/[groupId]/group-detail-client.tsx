"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const response = await apiFetch(`/api/groups/${groupId}/subgroups`, {
      method: "POST",
      body: JSON.stringify({ name: newSubgroupName }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear el subgrupo");
      return;
    }
    setNewSubgroupName("");
    await load();
  }

  async function handleRemoveMember(userId: string) {
    setError(null);
    const response = await apiFetch(`/api/groups/${groupId}/members/${userId}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "No se pudo eliminar al miembro");
      return;
    }
    await load();
  }

  if (!detail) return <main style={{ padding: "2rem" }}>Cargando...</main>;

  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1>{detail.group.name}</h1>
      {error ? <p role="alert">{error}</p> : null}

      <p>
        Codigo de invitacion: <code>{detail.group.inviteCode}</code>
      </p>
      <p>
        {detail.memberCount} / {detail.group.maxMembers} miembros · {detail.subgroupCount} /{" "}
        {detail.group.maxSubgroups} subgrupos
      </p>

      <section>
        <h2>Miembros</h2>
        <ul>
          {members?.map((member) => (
            <li key={member.userId}>
              {member.alias} ({member.role})
              {isAdmin && member.userId !== currentUserId ? (
                <button onClick={() => handleRemoveMember(member.userId)}>Eliminar</button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Subgrupos</h2>
        <ul>
          {subgroups?.map((subgroup) => <li key={subgroup.id}>{subgroup.name}</li>)}
        </ul>
        <form onSubmit={handleCreateSubgroup}>
          <input
            value={newSubgroupName}
            onChange={(e) => setNewSubgroupName(e.target.value)}
            placeholder="Nombre del subgrupo"
            maxLength={64}
            required
          />
          <button type="submit">Crear subgrupo</button>
        </form>
      </section>
    </main>
  );
}
