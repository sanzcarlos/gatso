"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";

interface GroupRow {
  group: { id: string; name: string; inviteCode: string };
  role: "admin" | "member";
}

export default function GroupsClient() {
  const [groups, setGroups] = useState<GroupRow[] | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadGroups() {
    const response = await apiFetch("/api/groups");
    if (response.ok) {
      const data = await response.json();
      setGroups(data.groups as GroupRow[]);
    }
  }

  useEffect(() => {
    loadGroups();
  }, []);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await apiFetch("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: newGroupName }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "No se pudo crear el grupo");
      return;
    }
    setNewGroupName("");
    await loadGroups();
  }

  async function handleJoin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const response = await apiFetch("/api/groups/join", {
      method: "POST",
      body: JSON.stringify({ inviteCode }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "No se pudo unir al grupo");
      return;
    }
    setInviteCode("");
    await loadGroups();
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 640 }}>
      <h1>Mis grupos</h1>

      {error ? <p role="alert">{error}</p> : null}

      <section>
        <h2>Crear grupo</h2>
        <form onSubmit={handleCreate}>
          <input
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="Nombre del grupo"
            maxLength={64}
            required
          />
          <button type="submit">Crear</button>
        </form>
      </section>

      <section>
        <h2>Unirme a un grupo</h2>
        <form onSubmit={handleJoin}>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="Codigo de invitacion"
            required
          />
          <button type="submit">Unirme</button>
        </form>
      </section>

      <section>
        <h2>Grupos</h2>
        {groups === null ? (
          <p>Cargando...</p>
        ) : groups.length === 0 ? (
          <p>Todavia no perteneces a ningun grupo.</p>
        ) : (
          <ul>
            {groups.map(({ group, role }) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`}>{group.name}</Link> ({role})
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
