// frontend/assets/js/auth/login.js
// Envia el login al backend (API_BASE) y maneja respuestas/errores con robustez.

(function () {
  const onSubmit = async e => {
    // Sólo nos interesa el formulario de login
    if (!e.target || e.target.id !== "login-form") return;
    e.preventDefault();

    const form = e.target;
    const emailEl = form.querySelector("#email");
    const passEl = form.querySelector("#password");
    const msgEl = form.querySelector("#login-error");
    const btn = form.querySelector('button[type="submit"]');

    const email = (emailEl?.value || "").trim();
    const pass = passEl?.value || "";

    // Toma la base definida en /assets/js/shared/api.js (ya apunta al subdominio API)
    const API_HOST = (window.API_BASE || "").replace(/\/$/, "");
    const LOGIN_URL = `${API_HOST}/api/auth/login`;

    // Limpia mensaje y deshabilita botón
    if (msgEl) {
      msgEl.textContent = "";
      msgEl.style.display = "none";
    }
    if (btn) btn.disabled = true;

    try {
      const payload = {
        email,
        // Enviamos ambas claves por compatibilidad (tu backend puede esperar 'password' o 'contrasena')
        password: pass,
        contrasena: pass,
      };

      const res = await fetch(LOGIN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // credentials: "include", // habilítalo sólo si usas cookies de sesión
        body: JSON.stringify(payload),
      });

      // Evita "Unexpected end of JSON input" si el body viene vacío
      const raw = await res.text();
      let data = null;
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch {
          /* ignora parse */
        }
      }

      if (!res.ok) {
        const msg = data?.message || data?.error || `Error ${res.status}`;
        throw new Error(msg);
      }

      // Guarda token/usuario si vienen en la respuesta
      if (data?.token) localStorage.setItem("token", data.token);
      if (data?.user) localStorage.setItem("user", JSON.stringify(data.user));

      // Redirección por rol (ajusta rutas si tus páginas viven bajo /views/)
      const role = (data?.user?.rol || "").toUpperCase();
      switch (role) {
        case "ADMINISTRADOR":
          window.location.href = "/dashboard/admin.html";
          break;
        case "EMPLEADO":
          window.location.href = "/dashboard/employee.html";
          break;
        case "CLIENTE":
          window.location.href = "/dashboard/customer.html";
          break;
        default:
          window.location.href = "/";
      }
    } catch (err) {
      console.error("Login error:", err);
      if (msgEl) {
        msgEl.textContent = err.message || "No se pudo iniciar sesión. Intenta más tarde.";
        msgEl.style.display = "block";
      } else {
        alert(err.message || "No se pudo iniciar sesión.");
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // Escucha a nivel documento como tenías, pero filtra por #login-form
  document.addEventListener("submit", onSubmit);
})();
