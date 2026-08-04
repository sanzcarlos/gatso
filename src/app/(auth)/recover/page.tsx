"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function RecoverPage() {
  const [username, setUsername] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch("/api/auth/recover", {
        method: "POST",
        body: JSON.stringify({ username, recoveryCode, newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "No se pudo recuperar la cuenta");
        return;
      }
      setNewRecoveryCode(data.recoveryCode as string);
    } finally {
      setLoading(false);
    }
  }

  if (newRecoveryCode) {
    return (
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Contrasena actualizada</CardTitle>
          <CardDescription>
            Se ha generado un nuevo codigo de recuperacion. El anterior ya no es valido. Guardalo en
            un lugar seguro:
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-center text-lg font-semibold tracking-wide text-foreground">
            {newRecoveryCode}
          </pre>
        </CardContent>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/login">Ir a iniciar sesion</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">Recuperar cuenta</CardTitle>
        <CardDescription>
          Si has perdido el codigo de recuperacion, no es posible recuperar la cuenta: no se
          recolectan datos de contacto por diseno de privacidad.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username">Usuario</Label>
            <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="recoveryCode">Codigo de recuperacion</Label>
            <Input
              id="recoveryCode"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="newPassword">Nueva contrasena</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
            {loading ? "Procesando..." : "Restablecer contrasena"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
