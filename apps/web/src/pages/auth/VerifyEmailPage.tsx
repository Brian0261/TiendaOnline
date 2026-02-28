import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ApiError } from "../../api/http";
import { api } from "../../api/http";

function toMessage(err: unknown): string {
  const e = err as Partial<ApiError>;
  if (e && typeof e.message === "string") return e.message;
  return "No se pudo verificar el email.";
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!token.trim()) {
        setLoading(false);
        setError("Token inválido o faltante.");
        return;
      }

      setLoading(true);
      setError(null);
      setOk(null);

      try {
        const res = await api.post<{ message?: string }>("/auth/verify-email", { token });
        if (!cancelled) setOk(res?.message || "Email verificado correctamente.");
      } catch (err) {
        if (!cancelled) setError(toMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h1>Verificación de email</h1>

      {loading ? <div className="alert alert-info">Verificando...</div> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {ok ? <div className="alert alert-success">{ok}</div> : null}

      <div className="d-flex gap-2">
        <Link className="btn btn-outline-secondary" to="/?login=1">
          Ir a login
        </Link>
      </div>
    </div>
  );
}
