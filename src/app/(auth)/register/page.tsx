"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, displayName: displayName.trim() || undefined, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo registrar el usuario");
        return;
      }
      setRecoveryCode(data.recoveryCode as string);
    } finally {
      setLoading(false);
    }
  }

  if (recoveryCode) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Cuenta creada</CardTitle>
          <CardDescription>
            Guarda este codigo de recuperacion en un lugar seguro. No se mostrara de nuevo y es la
            unica forma de recuperar tu cuenta si olvidas tu contrasena.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-center text-lg font-semibold tracking-wide text-foreground">
            {recoveryCode}
          </pre>
        </CardContent>
        <CardFooter>
          <Button className="w-full" onClick={() => router.push("/")}>
            Continuar
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">Crea tu cuenta</CardTitle>
        <CardDescription>Sin email ni datos personales, solo un usuario.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={32}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="displayName">Nombre visible (opcional)</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={64}
            />
            <p className="text-xs text-muted-foreground">
              Se mostrara a otras personas de tus grupos. Si lo dejas en blanco, se usara tu usuario.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contrasena</Label>
            <Input
              id="password"
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
        <CardFooter className="flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creando..." : "Crear cuenta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Inicia sesion
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
