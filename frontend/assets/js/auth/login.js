// frontend/assets/js/auth/login.js
// Modal de login robusto: detecta inputs por varios selectores
// y usa window.API.post() asegurando compatibilidad con backend
// (envía tanto `contrasena` como `password`). Además guarda el
// token usando la capa común (window.API.token.set).

(function () {
  /* ============ Helpers UI ============ */
  const $ = (sel, root = document) => root.querySelector(sel);

  function show(el, v) {
    if (!el) return;
    el.style.display = v ? "" : "none";
  }

  function setText(el, txt) {
    if (!el) return;
    el.textContent = txt;
  }

  function showError(msg) {
    const box = $("#login-error");
    if (box) {
      setText(box, msg || "Error al iniciar sesión.");
      show(box, true);
    } else {
      alert(msg || "Error al iniciar sesión.");
    }
  }

  function hideError() {
    const box = $("#login-error");
    if (box) show(box, false);
  }

  // Encuentra un input probando varios selectores comunes (id o name)
  function findInput(selectors) {
    for (const sel of selectors) {
      const node = $(sel);
      if (node) return node;
    }
    return null;
  }

  // Devuelve { email, password } leyendo tanto de modal como de páginas dedicadas
  function getCredentials() {
    const emailInput = findInput([
      "#login-email",
      "input#loginEmail",
      "input#email",
      "input[name=email]",
      "input[name=correo]",
      "input[id*='login'][type='email']",
      "input[type='email']",
    ]);

    const passInput = findInput([
      "#login-password",
      "input#loginPassword",
      "input#password",
      "input[name=password]",
      "input[name=contrasena]",
      "input[id*='login'][type='password']",
      "input[type='password']",
    ]);

    return {
      email: (emailInput?.value || "").trim(),
      password: passInput?.value || "",
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    hideError();

    const form = e.target.closest("#login-form");
    if (!form) return;

    const btn = $("#login-submit", form);
    const spin = $("#login-spinner", form); // opcional si existe
    const msg = $("#login-error", form);

    const { email, password } = getCredentials();

    if (!email || !password) {
      console.debug("[login] Campos detectados:", { email, passwordLen: password?.length });
      return showError("Completa tu correo y contraseña");
    }

    // Deshabilita UI
    btn && (btn.disabled = true);
    show(spin, true);

    try {
      if (!window.API || typeof window.API.post !== "function") {
        throw new Error("API no disponible en la página.");
      }

      // Enviamos ambos nombres de campo por compatibilidad backend
      const body = { email, contrasena: password, password };

      const data = await window.API.post("/auth/login", body);

      if (!data?.token) {
        throw new Error("Respuesta inválida del servidor.");
      }

      // Guarda token usando la capa común para que el resto del app lo lea
      if (window.API?.token?.set) {
        window.API.token.set(data.token);
      } else {
        localStorage.setItem("token", data.token); // fallback
      }

      // Guarda el usuario (opcional; algunas pantallas lo usan)
      localStorage.setItem("auth_user", JSON.stringify(data.user || {}));
      localStorage.setItem("user", JSON.stringify(data.user || {}));

      // Notifica cambio de auth
      window.dispatchEvent(new CustomEvent("auth:changed", { detail: { loggedIn: true, user: data.user } }));

      // Cierra modal si existe (Bootstrap)
      const modalEl = document.getElementById("loginModal");
      if (modalEl && window.bootstrap) {
        const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        inst.hide();
      }

      // (Opcional) Redirigir según rol aquí si quieres
      // if (data.user?.rol === "ADMINISTRADOR") location.href = "/views/dashboard/admin.html";
    } catch (err) {
      // Errores comunes
      if (err?.status === 401) return showError("Credenciales inválidas.");
      if (err?.status === 405) return showError("Método no permitido.");
      if (err?.status === 404) return showError("Ruta de autenticación no encontrada.");
      console.error("Login error:", err);
      showError(err?.message || "No se pudo iniciar sesión.");
    } finally {
      show(spin, false);
      btn && (btn.disabled = false);
    }
  }

  // Delegación: el modal puede cargarse por parciales
  document.addEventListener("submit", e => {
    const form = e.target;
    if (form && form.id === "login-form") onSubmit(e);
  });

  // Botón del modal (por si hay click directo)
  document.addEventListener("click", e => {
    const btn = e.target.closest("#login-submit");
    if (!btn) return;
    const form = document.getElementById("login-form");
    if (form) form.requestSubmit ? form.requestSubmit() : form.submit();
  });
})();
