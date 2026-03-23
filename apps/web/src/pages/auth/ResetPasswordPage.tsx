import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { ApiError } from "../../api/http";
import { api } from "../../api/http";

function toMessage(err: unknown): string {
  const e = err as Partial<ApiError>;
  if (e && typeof e.message === "string") return e.message;
  return "No se pudo restablecer la contraseña.";
}

function isStrongPassword(value: string): boolean {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(value || ""));
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!token.trim()) return false;
    if (!password.trim()) return false;
    if (!isStrongPassword(password)) return false;
    if (password !== confirm) return false;
    return true;
  }, [confirm, loading, password, token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (!canSubmit) return;

    setLoading(true);
    try {
      const res = await api.post<{ message?: string }>("/auth/reset-password", { token, newPassword: password });
      setOk(res?.message || "Contraseña actualizada correctamente.");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!token.trim()) {
    return (
      <div className="container" style={{ paddingTop: 24 }}>
        <h1>Restablecer contraseña</h1>
        <div className="alert alert-danger">Token inválido o faltante.</div>
        <Link className="btn btn-outline-secondary" to="/forgot-password">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h1>Restablecer contraseña</h1>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {ok ? <div className="alert alert-success">{ok}</div> : null}

      <form onSubmit={onSubmit} style={{ maxWidth: 520 }} autoComplete="off">
        <div className="mb-3">
          <label className="form-label">Nueva contraseña</label>
          <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          <div className="form-text">Mínimo 8 caracteres, una mayúscula y un número.</div>
          {password && !isStrongPassword(password) ? (
            <div className="form-text text-danger">La contraseña no cumple los requisitos mínimos.</div>
          ) : null}
        </div>

        <div className="mb-3">
          <label className="form-label">Confirmar contraseña</label>
          <input className="form-control" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required />
          {confirm && password !== confirm ? <div className="form-text text-danger">Las contraseñas no coinciden.</div> : null}
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-danger" type="submit" disabled={!canSubmit}>
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
          <Link className="btn btn-outline-secondary" to="/login">
            Ir a login
          </Link>
        </div>
      </form>
    </div>
  );
}
