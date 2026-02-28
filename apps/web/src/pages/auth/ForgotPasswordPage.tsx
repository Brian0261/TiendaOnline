import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import type { ApiError } from "../../api/http";
import { api } from "../../api/http";

function toMessage(err: unknown): string {
  const e = err as Partial<ApiError>;
  if (e && typeof e.message === "string") return e.message;
  return "No se pudo procesar la solicitud.";
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!email.trim()) return false;
    return true;
  }, [email, loading]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (!canSubmit) return;

    setLoading(true);
    try {
      const res = await api.post<{ message?: string }>("/auth/forgot-password", { email: email.trim() });
      setOk(res?.message || "Si el correo existe, recibirás instrucciones.");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h1>Recuperar contraseña</h1>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {ok ? <div className="alert alert-success">{ok}</div> : null}

      <form onSubmit={onSubmit} style={{ maxWidth: 520 }}>
        <div className="mb-3">
          <label className="form-label">Correo electrónico</label>
          <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-danger" type="submit" disabled={!canSubmit}>
            {loading ? "Enviando..." : "Enviar"}
          </button>
          <Link className="btn btn-outline-secondary" to="/?login=1">
            Volver a iniciar sesión
          </Link>
        </div>
      </form>
    </div>
  );
}
