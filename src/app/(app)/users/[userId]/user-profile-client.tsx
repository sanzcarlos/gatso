"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client-fetch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface Profile {
  id: string;
  alias: string;
  createdAt: string;
}

export default function UserProfileClient({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notFound, setNotFound] = useState(false);

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
          <AvatarFallback className="text-lg">{profile.alias.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{profile.alias}</h1>
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
    </div>
  );
}
