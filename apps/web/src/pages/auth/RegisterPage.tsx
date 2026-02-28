import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiError } from "../../api/http";
import { useAuth } from "../../auth/useAuth";

function toMessage(err: unknown): string {
  const e = err as Partial<ApiError>;
  if (e && typeof e.message === "string") return e.message;
  return "No se pudo completar el registro.";
}

export function RegisterPage() {
  const nav = useNavigate();
  const { register } = useAuth();

  // Anti-bot simple: honeypot + tiempo mínimo de llenado.
  const [formStartedAt] = useState(() => Date.now());
  const [website, setWebsite] = useState("");

  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (!nombre.trim() || !apellido.trim() || !email.trim() || !password.trim() || !direccion.trim()) return false;
    return true;
  }, [apellido, direccion, email, loading, nombre, password]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(null);

    if (!canSubmit) return;

    setLoading(true);
    try {
      const res = await register({
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim(),
        password,
        telefono: telefono.trim() || undefined,
        direccion_principal: direccion.trim(),
        // Campos anti-bot: deben coincidir con lo que valida el backend.
        website,
        form_started_at: formStartedAt,
      });

      setOk(res?.message || "Registro exitoso. Revisa tu correo para verificar tu cuenta.");
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: 24 }}>
      <h1>Registro</h1>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {ok ? <div className="alert alert-success">{ok}</div> : null}

      <form onSubmit={onSubmit} style={{ maxWidth: 520 }} autoComplete="off">
        {/* Honeypot: oculto para humanos; bots suelen completarlo. */}
        <input
          type="text"
          name="website"
          value={website}
          onChange={e => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          style={{ position: "absolute", left: -10000, width: 1, height: 1, opacity: 0 }}
          aria-hidden="true"
        />
        <div className="row g-3">
          <div className="col-12 col-md-6">
            <label className="form-label">Nombre</label>
            <input className="form-control" value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="given-name" required />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Apellido</label>
            <input className="form-control" value={apellido} onChange={e => setApellido(e.target.value)} autoComplete="family-name" required />
          </div>

          <div className="col-12">
            <label className="form-label">Correo electrónico</label>
            <input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
          </div>

          <div className="col-12">
            <label className="form-label">Contraseña</label>
            <input
              className="form-control"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <div className="form-text">Mínimo 8 caracteres, una mayúscula y un número.</div>
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Teléfono (opcional)</label>
            <input className="form-control" value={telefono} onChange={e => setTelefono(e.target.value)} autoComplete="tel" />
          </div>

          <div className="col-12 col-md-6">
            <label className="form-label">Dirección principal</label>
            <input className="form-control" value={direccion} onChange={e => setDireccion(e.target.value)} autoComplete="address-line1" required />
          </div>

          <div className="col-12 d-flex gap-2">
            <button className="btn btn-danger" type="submit" disabled={!canSubmit}>
              {loading ? "Registrando..." : "Registrarse"}
            </button>
            <Link className="btn btn-outline-secondary" to="?login=1">
              Ya tengo cuenta
            </Link>
            <button className="btn btn-outline-secondary" type="button" onClick={() => nav("/forgot-password")}>
              Olvidé mi contraseña
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
