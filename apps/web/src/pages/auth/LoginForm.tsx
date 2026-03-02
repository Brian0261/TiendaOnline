import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { ApiError } from "../../api/http";
import { useAuth } from "../../auth/useAuth";

const SAVED_EMAILS_KEY = "saved_login_emails";
const MAX_SAVED_EMAILS = 10;

function normalizeEmail(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function readSavedEmails(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_EMAILS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(v => normalizeEmail(String(v)))
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .slice(0, MAX_SAVED_EMAILS);
  } catch {
    return [];
  }
}

function writeSavedEmails(emails: string[]): void {
  try {
    localStorage.setItem(SAVED_EMAILS_KEY, JSON.stringify(emails));
  } catch {
    // ignore (por ejemplo, storage lleno o bloqueado)
  }
}

function uniqEmails(values: string[]): string[] {
  const out: string[] = [];
  for (const raw of values) {
    const v = normalizeEmail(raw);
    if (!v) continue;
    if (out.includes(v)) continue;
    out.push(v);
  }
  return out;
}

type LoginFormProps = {
  onSuccess?: (user: { rol?: unknown }) => void;
  onCancel?: () => void;
  submitClassName?: string;
  loginChannel?: "customer" | "staff";
};

function toMessage(err: unknown): string {
  const e = err as Partial<ApiError>;
  if (e && typeof e.message === "string") return e.message;
  return "No se pudo iniciar sesión.";
}

export function LoginForm({ onSuccess, onCancel, submitClassName, loginChannel = "customer" }: LoginFormProps) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [savedEmails, setSavedEmails] = useState<string[]>(() => readSavedEmails());
  const [emailSuggestOpen, setEmailSuggestOpen] = useState(false);
  const [emailActiveIndex, setEmailActiveIndex] = useState(-1);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailWrapRef = useRef<HTMLDivElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);
  const optionButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const filteredEmails = useMemo(() => {
    const q = normalizeEmail(email);
    const list = Array.isArray(savedEmails) ? savedEmails : [];
    if (!list.length) return [];
    if (!q) return list;
    return list.filter(v => v.includes(q));
  }, [email, savedEmails]);

  const rememberEmail = (raw: string) => {
    const normalizedEmail = normalizeEmail(raw);
    if (!normalizedEmail) return;
    // Evita guardar basura evidente.
    if (!normalizedEmail.includes("@")) return;

    setSavedEmails(prev => {
      const next = uniqEmails([normalizedEmail, ...prev]).slice(0, MAX_SAVED_EMAILS);
      writeSavedEmails(next);
      return next;
    });
  };

  const removeEmail = (raw: string) => {
    const normalizedEmail = normalizeEmail(raw);
    if (!normalizedEmail) return;
    setSavedEmails(prev => {
      const next = uniqEmails(prev).filter(v => v !== normalizedEmail);
      writeSavedEmails(next);
      if (next.length === 0) setEmailSuggestOpen(false);
      return next;
    });
  };

  const focusEmailInput = () => {
    emailInputRef.current?.focus();
  };

  const focusPasswordInput = () => {
    passwordInputRef.current?.focus();
  };

  const focusOption = (idx: number) => {
    const el = optionButtonRefs.current[idx];
    if (el) el.focus();
  };

  const scrollOptionIntoView = (idx: number) => {
    const el = optionButtonRefs.current[idx];
    if (!el) return;
    try {
      el.scrollIntoView({ block: "nearest" });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!emailSuggestOpen) {
      if (emailActiveIndex !== -1) setEmailActiveIndex(-1);
      return;
    }
    if (filteredEmails.length === 0) {
      if (emailActiveIndex !== -1) setEmailActiveIndex(-1);
      return;
    }
    if (emailActiveIndex >= filteredEmails.length) {
      setEmailActiveIndex(filteredEmails.length - 1);
    }
  }, [emailSuggestOpen, filteredEmails.length, emailActiveIndex]);

  const canSubmit = useMemo(() => email.trim().length > 0 && password.trim().length > 0 && !loading, [email, password, loading]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    setLoading(true);
    try {
      const normalizedEmail = normalizeEmail(email);
      rememberEmail(normalizedEmail);
      const u = await login({ email: normalizedEmail, password, channel: loginChannel });
      onSuccess?.(u as { rol?: unknown });
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!emailSuggestOpen) return;
    const onDocMouseDown = (ev: MouseEvent) => {
      const root = emailWrapRef.current;
      if (!root) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      setEmailSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [emailSuggestOpen]);

  return (
    <form onSubmit={onSubmit} autoComplete="on">
      {error ? <div className="alert alert-danger py-2">{error}</div> : null}

      <div className="mb-3">
        <label className="form-label">Correo electrónico</label>
        <div
          className="position-relative"
          ref={emailWrapRef}
          onBlurCapture={e => {
            // Cierra solo cuando el foco sale del bloque (input + lista).
            // Usar relatedTarget evita carreras con setTimeout/focus.
            const root = emailWrapRef.current;
            const next = e.relatedTarget;
            if (root && next instanceof Node && root.contains(next)) return;
            rememberEmail(email);
            setEmailSuggestOpen(false);
            setEmailActiveIndex(-1);
          }}
        >
          <input
            ref={emailInputRef}
            type="email"
            className="form-control"
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setEmailActiveIndex(-1);
            }}
            onMouseDown={() => {
              setEmailSuggestOpen(true);
              setEmailActiveIndex(-1);
            }}
            onClick={() => {
              setEmailSuggestOpen(true);
              setEmailActiveIndex(-1);
            }}
            onKeyDown={e => {
              if (e.key === "Escape") {
                if (emailSuggestOpen) {
                  e.preventDefault();
                  setEmailSuggestOpen(false);
                  setEmailActiveIndex(-1);
                }
                return;
              }

              if (e.key === "Enter" && emailSuggestOpen && emailActiveIndex >= 0 && emailActiveIndex < filteredEmails.length) {
                e.preventDefault();
                const v = filteredEmails[emailActiveIndex];
                setEmail(v);
                setEmailSuggestOpen(false);
                setEmailActiveIndex(-1);
                return;
              }

              if (e.key === "ArrowDown") {
                if (filteredEmails.length > 0) {
                  e.preventDefault();
                  setEmailSuggestOpen(true);
                  setEmailActiveIndex(prev => {
                    const next = prev < 0 ? 0 : Math.min(prev + 1, filteredEmails.length - 1);
                    window.setTimeout(() => scrollOptionIntoView(next), 0);
                    return next;
                  });
                  return;
                }
              }

              if (e.key === "ArrowUp") {
                if (filteredEmails.length > 0 && emailSuggestOpen) {
                  e.preventDefault();
                  setEmailActiveIndex(prev => {
                    const next = prev <= 0 ? -1 : prev - 1;
                    if (next >= 0) window.setTimeout(() => scrollOptionIntoView(next), 0);
                    return next;
                  });
                  return;
                }
              }

              // Tab: si la lista está abierta, navega dentro de ella (no saltes a contraseña todavía)
              if (e.key === "Tab" && !e.shiftKey && emailSuggestOpen && filteredEmails.length > 0) {
                e.preventDefault();
                setEmailActiveIndex(prev => {
                  if (prev < 0) {
                    window.setTimeout(() => scrollOptionIntoView(0), 0);
                    return 0;
                  }
                  const next = prev + 1;
                  if (next >= filteredEmails.length) {
                    setEmailSuggestOpen(false);
                    setEmailActiveIndex(-1);
                    window.setTimeout(() => focusPasswordInput(), 0);
                    return -1;
                  }
                  window.setTimeout(() => scrollOptionIntoView(next), 0);
                  return next;
                });
              }

              if (e.key === "Tab" && e.shiftKey && emailSuggestOpen && filteredEmails.length > 0) {
                e.preventDefault();
                setEmailActiveIndex(prev => {
                  const next = prev <= 0 ? -1 : prev - 1;
                  if (next >= 0) window.setTimeout(() => scrollOptionIntoView(next), 0);
                  return next;
                });
              }
            }}
            placeholder="tu@correo.com"
            autoComplete="username email"
            required
          />

          {emailSuggestOpen && filteredEmails.length > 0 ? (
            <div
              className="position-absolute start-0 top-100 mt-1 bg-white border rounded shadow-sm"
              style={{ width: "100%", zIndex: 1060, maxHeight: 180, overflowY: "auto" }}
              role="listbox"
              aria-label="Correos guardados"
            >
              <div className="list-group list-group-flush">
                {filteredEmails.map((v, idx) => (
                  <div
                    key={v}
                    className={
                      "list-group-item list-group-item-action d-flex align-items-center justify-content-between gap-2" +
                      (idx === emailActiveIndex ? " active" : "")
                    }
                    role="option"
                    aria-selected={idx === emailActiveIndex}
                    style={{ cursor: "pointer" }}
                  >
                    <button
                      ref={el => {
                        optionButtonRefs.current[idx] = el;
                      }}
                      type="button"
                      className={"btn btn-link p-0 text-start flex-grow-1" + (idx === emailActiveIndex ? " text-white" : " text-reset")}
                      style={{ textDecoration: "none", minWidth: 0 }}
                      onMouseDown={e => {
                        // Evita que el input pierda foco antes de seleccionar.
                        e.preventDefault();
                      }}
                      onKeyDown={e => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEmailSuggestOpen(false);
                          setEmailActiveIndex(-1);
                          window.setTimeout(() => focusEmailInput(), 0);
                          return;
                        }

                        if (e.key === "Enter") {
                          e.preventDefault();
                          setEmail(v);
                          setEmailSuggestOpen(false);
                          setEmailActiveIndex(-1);
                          window.setTimeout(() => focusEmailInput(), 0);
                          return;
                        }

                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          const next = Math.min(idx + 1, filteredEmails.length - 1);
                          window.setTimeout(() => focusOption(next), 0);
                          return;
                        }

                        if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const prev = idx - 1;
                          if (prev < 0) {
                            window.setTimeout(() => focusEmailInput(), 0);
                            return;
                          }
                          window.setTimeout(() => focusOption(prev), 0);
                          return;
                        }

                        if (e.key === "Tab") {
                          e.preventDefault();
                          if (e.shiftKey) {
                            const prev = idx - 1;
                            if (prev < 0) {
                              window.setTimeout(() => focusEmailInput(), 0);
                              return;
                            }
                            window.setTimeout(() => focusOption(prev), 0);
                            return;
                          }

                          const next = idx + 1;
                          if (next >= filteredEmails.length) {
                            setEmailSuggestOpen(false);
                            window.setTimeout(() => focusPasswordInput(), 0);
                            return;
                          }
                          window.setTimeout(() => focusOption(next), 0);
                        }
                      }}
                      onClick={() => {
                        setEmail(v);
                        setEmailSuggestOpen(false);
                        setEmailActiveIndex(-1);
                      }}
                    >
                      <span className="text-truncate d-block" style={{ minWidth: 0 }}>
                        {v}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-muted"
                      aria-label="Eliminar correo guardado"
                      tabIndex={-1}
                      onMouseDown={e => {
                        // No permitas que el click en la X dispare el onClick del padre.
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        removeEmail(v);
                      }}
                      style={{ textDecoration: "none", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mb-2">
        <label className="form-label">Contraseña</label>
        <div className="position-relative">
          <input
            ref={passwordInputRef}
            type={showPassword ? "text" : "password"}
            className="form-control pe-5"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            className="btn btn-link text-muted position-absolute end-0 top-50 translate-middle-y"
            style={{ textDecoration: "none" }}
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
            onClick={() => setShowPassword(v => !v)}
          >
            <i className={showPassword ? "fas fa-eye-slash" : "fas fa-eye"} aria-hidden="true"></i>
          </button>
        </div>
      </div>

      {onCancel ? (
        <div className="modal-footer px-0 pb-0">
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className={submitClassName || "btn btn-danger"} disabled={!canSubmit}>
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </div>
      ) : (
        <button className={submitClassName || "btn btn-danger"} type="submit" disabled={!canSubmit}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      )}
    </form>
  );
}
