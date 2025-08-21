// frontend/assets/js/auth/login.js
// Modal de login robusto:
// - Detecta inputs por varios selectores.
// - Llama a window.API.post("/auth/login", body) enviando { email, contrasena, password }.
// - Guarda token y usuario en localStorage.
// - Emite eventos "auth:login" y "auth:changed" para refrescar navbar sin F5.
// - Persiste correos en localStorage (login_emails) para autocompletar (datalist).
// - Redirige al dashboard según el rol (CLIENTE / ADMINISTRADOR / EMPLEADO).

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
      emailInput,
      passInput,
    };
  }

  /* ============ Historial de correos (para <datalist>) ============ */
  const EMAIL_KEY = "login_emails";
  function persistEmail(email) {
    try {
      if (!email) return;
      const list = JSON.parse(localStorage.getItem(EMAIL_KEY) || "[]");
      const next = [email, ...list.filter(e => e !== email)].slice(0, 8);
      localStorage.setItem(EMAIL_KEY, JSON.stringify(next));
    } catch {}
  }

  function repopulateDatalist() {
    try {
      const dl = document.getElementById("login-email-history");
      if (!dl) return; // si tu modal no usa datalist, no pasa nada
      const emails = JSON.parse(localStorage.getItem(EMAIL_KEY) || "[]");
      dl.innerHTML = emails.map(e => `<option value="${e}"></option>`).join("");
    } catch {}
  }

  // Prepara BroadcastChannel (si existe) para avisar a otras pestañas
  const bc = "BroadcastChannel" in window ? new BroadcastChannel("bodega") : null;

  async function onSubmit(e) {
    e.preventDefault();
    hideError();

    const form = e.target.closest("#login-form");
    if (!form) return;

    const btn = $("#login-submit", form);
    const spin = $("#login-spinner", form); // opcional si existe

    const { email, password, passInput } = getCredentials();

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

      // Guarda token usando la capa común (si existe) o fallback
      if (window.API?.token?.set) {
        window.API.token.set(data.token);
      } else {
        localStorage.setItem("token", data.token);
      }

      // Guarda el usuario (muchas pantallas lo usan)
      const user = data.user || {};
      localStorage.setItem("auth_user", JSON.stringify(user));
      localStorage.setItem("user", JSON.stringify(user)); // compat

      // Persistir correo para autocompletar en próximas aperturas
      persistEmail(email);

      // Notifica a la app (misma pestaña)
      window.dispatchEvent(new CustomEvent("auth:login", { detail: user }));
      // Compatibilidad con listeners antiguos:
      window.dispatchEvent(new CustomEvent("auth:changed", { detail: { loggedIn: true, user } }));

      // Notifica a otras pestañas (si hubiese)
      if (bc) bc.postMessage({ type: "auth-login", user });

      // Cierra modal si existe (Bootstrap)
      const modalEl = document.getElementById("loginModal");
      if (modalEl && window.bootstrap) {
        const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        inst.hide();
      }

      // Limpia el password del input por seguridad
      if (passInput) passInput.value = "";

      // ───────────────────────────────
      // Redirigir al dashboard por rol
      // ───────────────────────────────
      try {
        // Normaliza el rol
        const role = String(user?.rol || "").toUpperCase();
        // Import absoluto para que funcione en local y producción
        const { redirigirDashboard } = await import("/assets/js/main.js");
        redirigirDashboard(role);
        return; // detenemos el flujo aquí tras redirigir
      } catch (e) {
        // Fallback ultra simple (por si import fallara)
        const role = String(user?.rol || "").toUpperCase();
        const target =
          role === "ADMINISTRADOR" ? "/dashboard/admin.html" : role === "EMPLEADO" ? "/dashboard/employee.html" : "/dashboard/customer.html";
        window.location.href = target;
        return;
      }

      // (Si no redirigimos arriba, podríamos limpiar ?login=true,
      // pero en la práctica ya salimos por return)
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
      // Repoblar datalist por si el modal sigue abierto
      repopulateDatalist();
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

  // Cuando se muestra el modal, repoblar datalist de correos
  document.addEventListener("shown.bs.modal", ev => {
    if (ev?.target?.id === "loginModal") {
      repopulateDatalist();
    }
  });
})();
