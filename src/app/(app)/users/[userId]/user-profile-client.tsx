"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Pencil } from "lucide-react";

interface Profile {
  id: string;
  displayName: string;
  createdAt: string;
}

export default function UserProfileClient({ userId, currentUserId }: { userId: string; currentUserId?: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  const isOwnProfile = currentUserId === userId;

  useEffect(() => {
    let active = true;
    apiFetch(`/api/users/${userId}`).then(async (response) => {
      if (!active) return;
      if (!response.ok) {
        if (response.status === 404) {
          setNotFound(true);
        } else {
          const data = await response.json().catch(() => ({}));
          toast.error(data.error ?? "No se pudo cargar el perfil");
        }
        return;
      }
      const data = await response.json();
      setProfile(data.profile);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await apiFetch(`/api/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ displayName: displayNameInput }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo actualizar el nombre visible");
        return;
      }
      setProfile((prev) => (prev ? { ...prev, displayName: displayNameInput.trim() } : prev));
      toast.success("Nombre visible actualizado");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return <p className="text-sm text-muted-foreground">Este usuario no existe.</p>;
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="text-lg">{profile.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{profile.displayName}</h1>
          <p className="text-sm text-muted-foreground">Perfil de usuario</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informacion</CardTitle>
          <CardDescription>
            Perfil de solo lectura. Por privacidad, Gatso no muestra nombre real, email ni actividad detallada.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Miembro desde: </span>
            {new Date(profile.createdAt).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>

      {isOwnProfile ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nombre visible</CardTitle>
            <CardDescription>
              Se muestra a otras personas de tus grupos (gastos, liquidaciones, auditoria...). Puedes cambiarlo cuando
              quieras; tu usuario de acceso no cambia.
            </CardDescription>
          </CardHeader>
          {editing ? (
            <form onSubmit={handleSave}>
              <CardContent className="flex flex-col gap-2">
                <Label htmlFor="profile-display-name">Nombre visible</Label>
                <Input
                  id="profile-display-name"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  minLength={1}
                  maxLength={64}
                  required
                />
              </CardContent>
              <CardFooter className="gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                  Cancelar
                </Button>
              </CardFooter>
            </form>
          ) : (
            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDisplayNameInput(profile.displayName);
                  setEditing(true);
                }}
              >
                <Pencil />
                Editar
              </Button>
            </CardFooter>
          )}
        </Card>
      ) : null}
    </div>
  );
}
