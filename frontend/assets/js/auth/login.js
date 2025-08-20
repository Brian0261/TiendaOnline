// frontend/assets/js/auth/login.js
// Modal de login robusto: detecta inputs por varios selectores y usa API.post()

(function () {
  // ===== Helpers UI =====
  function showError(msg) {
    const el = document.getElementById("login-error");
    if (el) {
      el.textContent = msg || "Error al iniciar sesión.";
      el.style.display = "block";
    } else {
      alert(msg || "Error al iniciar sesión.");
    }
  }
  function hideError() {
    const el = document.getElementById("login-error");
    if (el) el.style.display = "none";
  }

  // Encuentra un input probando varios selectores comunes (id o name)
  function findInput(selectors) {
    for (const sel of selectors) {
      const node = document.querySelector(sel);
      if (node) return node;
    }
    return null;
  }

  // Devuelve { email, password } leyendo tanto de modal como de páginas dedicadas
  function getCredentials() {
    const emailInput = findInput([
      "#login-email",
      "input#email",
      "input[name=email]",
      "input[name='correo']",
      "input[id*='login'][type='email']",
      "input[type='email']",
    ]);
    const passInput = findInput([
      "#login-password",
      "input#password",
      "input[name=password]",
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

    const { email, password } = getCredentials();

    if (!email || !password) {
      // Log de depuración para que veas qué encontró
      console.debug("[login] Campos detectados:", { email, passwordLen: password?.length });
      return showError("Completa tu correo y contraseña");
    }

    try {
      const data = await window.API.post("auth/login", { email, password });

      if (!data?.token) {
        return showError("Respuesta inválida del servidor.");
      }

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user || {}));
      window.dispatchEvent(new CustomEvent("auth:changed", { detail: { loggedIn: true, user: data.user } }));

      // Cierra modal si existe
      const modalEl = document.getElementById("loginModal");
      if (modalEl && window.bootstrap) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();
      }
    } catch (err) {
      if (err?.status === 401) return showError("Credenciales inválidas.");
      if (err?.status === 405) return showError("Método no permitido.");
      if (err?.status === 404) return showError("Ruta de autenticación no encontrada.");
      console.error("Login error:", err);
      showError(err?.message || "No se pudo iniciar sesión.");
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
