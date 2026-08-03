"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ alias, password }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "No se pudo iniciar sesion");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-5">
        <CardTitle className="text-2xl">Bienvenido de nuevo</CardTitle>
        <CardDescription>Introduce tu alias y contrasena.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="alias">Alias</Label>
            <Input id="alias" value={alias} onChange={(e) => setAlias(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Contrasena</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <div className="flex w-full justify-between text-sm text-muted-foreground">
            <Link href="/recover" className="font-medium text-primary hover:underline">
              Olvide mi contrasena
            </Link>
            <Link href="/register" className="font-medium text-primary hover:underline">
              Crear cuenta
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
