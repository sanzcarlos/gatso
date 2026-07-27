"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client-fetch";

export default function RegisterPage() {
  const router = useRouter();
  const [alias, setAlias] = useState("");
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
        body: JSON.stringify({ alias, password }),
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
      <main style={{ padding: "2rem", maxWidth: 480 }}>
        <h1>Cuenta creada</h1>
        <p>
          Guarda este codigo de recuperacion en un lugar seguro. No se
          mostrara de nuevo y es la unica forma de recuperar tu cuenta si
          olvidas tu contrasena.
        </p>
        <pre style={{ fontSize: "1.25rem", padding: "1rem", background: "#1c2530" }}>
          {recoveryCode}
        </pre>
        <button onClick={() => router.push("/")}>Continuar</button>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 480 }}>
      <h1>Crear cuenta</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="alias">Alias</label>
          <input
            id="alias"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            minLength={3}
            maxLength={32}
            required
          />
        </div>
        <div>
          <label htmlFor="password">Contrasena</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={10}
            required
          />
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "Creando..." : "Crear cuenta"}
        </button>
      </form>
    </main>
  );
}
