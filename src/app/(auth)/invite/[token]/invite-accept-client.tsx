"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

interface Preview {
  groupName: string;
  expiresAt: string;
}

export default function InviteAcceptClient({ token }: { token: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch(`/api/invitations/${token}`).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPreviewError(data.error ?? "Esta invitacion no es valida");
        return;
      }
      setPreview(data as Preview);
    });
  }, [token]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch(`/api/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ alias, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "No se pudo aceptar la invitacion");
        return;
      }
      router.push(`/groups/${data.group.id}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (previewError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitacion no disponible</CardTitle>
          <CardDescription>{previewError}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" asChild>
            <Link href="/login">Ir a iniciar sesion</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Te han invitado a &quot;{preview.groupName}&quot;</CardTitle>
        <CardDescription>
          Crea tu cuenta (solo alias y contrasena) para unirte directamente al grupo. Este enlace
          caduca el {new Date(preview.expiresAt).toLocaleString()}.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-alias">Alias</Label>
            <Input
              id="invite-alias"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              minLength={3}
              maxLength={32}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-password">Contrasena</Label>
            <Input
              id="invite-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={10}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Uniendome..." : "Crear cuenta y unirme"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
