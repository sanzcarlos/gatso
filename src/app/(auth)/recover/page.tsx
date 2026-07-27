"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client-fetch";

export default function RecoverPage() {
  const [alias, setAlias] = useState("");
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
        body: JSON.stringify({ alias, recoveryCode, newPassword }),
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
      <main style={{ padding: "2rem", maxWidth: 480 }}>
        <h1>Contrasena actualizada</h1>
        <p>
          Se ha generado un nuevo codigo de recuperacion. El anterior ya no
          es valido. Guardalo en un lugar seguro:
        </p>
        <pre style={{ fontSize: "1.25rem", padding: "1rem", background: "#1c2530" }}>
          {newRecoveryCode}
        </pre>
        <a href="/login">Ir a iniciar sesion</a>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 480 }}>
      <h1>Recuperar cuenta</h1>
      <p>
        Introduce tu alias, tu codigo de recuperacion (entregado al crear la
        cuenta) y una nueva contrasena. Si has perdido el codigo de
        recuperacion, no es posible recuperar la cuenta: no se recolectan
        datos de contacto por diseno de privacidad.
      </p>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="alias">Alias</label>
          <input id="alias" value={alias} onChange={(e) => setAlias(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="recoveryCode">Codigo de recuperacion</label>
          <input
            id="recoveryCode"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="newPassword">Nueva contrasena</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={10}
            required
          />
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit" disabled={loading}>
          {loading ? "Procesando..." : "Restablecer contrasena"}
        </button>
      </form>
    </main>
  );
}
