import Link from "next/link";
import { getSession } from "@/lib/auth/session";

export default async function HomePage() {
  const session = await getSession();

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Gatso</h1>
      <p>Control de gastos compartidos entre amigos.</p>

      {session ? (
        <p>
          Sesion activa como <strong>{session.alias}</strong>.
        </p>
      ) : (
        <nav>
          <Link href="/login">Iniciar sesion</Link>
          {" · "}
          <Link href="/register">Crear cuenta</Link>
        </nav>
      )}
    </main>
  );
}
