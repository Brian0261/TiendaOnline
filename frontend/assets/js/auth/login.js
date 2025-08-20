// frontend/assets/js/auth/login.js
// Login desde modal o página dedicada, usando el helper window.API
// Funciona en staging y en localhost.

(function () {
  const $ = (sel, root = document) => root.querySelector(sel);

  function getLoginForm() {
    // Acepta ambas variantes de id por compatibilidad
    return document.getElementById("loginForm") || document.getElementById("login-form");
  }

  function bind() {
    const form = getLoginForm();
    if (form && !form.__bound) {
      form.addEventListener("submit", onSubmit);
      form.__bound = true;
    }
  }

  // El modal puede cargarse dinámicamente: nos enganchamos en varios eventos
  document.addEventListener("DOMContentLoaded", bind);
  document.addEventListener("shown.bs.modal", bind);
  document.addEventListener("submit", e => {
    const id = e.target?.id || "";
    if (id === "loginForm" || id === "login-form") onSubmit(e);
  });

  function ui(form) {
    return {
      emailEl: form.querySelector('#loginEmail, input[name="email"]'),
      passEl: form.querySelector('#loginPassword, input[name="password"]'),
      btn: form.querySelector('button[type="submit"], #login-submit'),
      errBox: document.getElementById("login-error"),
    };
  }

  function showError(U, msg) {
    if (U.errBox) {
      U.errBox.textContent = msg;
      U.errBox.style.display = "block";
    } else if (window.Toast?.error) {
      window.Toast.error(msg);
    } else {
      alert(msg);
    }
  }
  function clearError(U) {
    if (U.errBox) U.errBox.style.display = "none";
  }
  function setBusy(U, busy) {
    if (U.btn) {
      U.btn.disabled = !!busy;
      U.btn.dataset.loading = busy ? "1" : "";
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const U = ui(form);
    clearError(U);

    const email = (U.emailEl?.value || "").trim();
    const password = U.passEl?.value || "";

    if (!email || !password) {
      showError(U, "Completa tu correo y contraseña.");
      return;
    }

    try {
      setBusy(U, true);

      // Usa SIEMPRE el helper API. Importante: sin "/" inicial para evitar // en la URL.
      // Mandamos también "correo" por si el backend lo espera con ese nombre.
      const resp = await window.API.post("auth/login", { email, correo: email, password });

      if (!resp?.token) {
        throw new Error(resp?.message || resp?.error || "Credenciales inválidas.");
      }

      // Persistencia de sesión (claves compatibles)
      localStorage.setItem("token", resp.token);
      localStorage.setItem("auth_token", resp.token);
      if (resp.user) localStorage.setItem("user", JSON.stringify(resp.user));

      // Notifica a la app (navbar, etc.)
      window.dispatchEvent(new CustomEvent("auth:changed", { detail: { loggedIn: true, user: resp.user || null } }));

      // Cierra modal si existe (Bootstrap 5)
      const modalEl = document.getElementById("loginModal");
      if (modalEl && window.bootstrap?.Modal) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.hide();
      }

      // Redirección
      const next = new URLSearchParams(location.search).get("next");
      location.href = next || "/";
    } catch (err) {
      console.error("Login error:", err);
      if (err?.status === 401) showError(U, "Credenciales inválidas.");
      else if (err?.status === 405) showError(U, "Método no permitido en este host. Asegúrate de no tener 'action' en el formulario.");
      else if (err?.status === 404) showError(U, "Ruta de autenticación no encontrada.");
      else showError(U, err?.message || "No se pudo iniciar sesión.");
    } finally {
      setBusy(U, false);
    }
  }
})();
