// frontend/assets/js/auth/login.js
document.addEventListener("submit", async e => {
  // Sólo nos interesa el formulario de login
  if (e.target.id !== "login-form") return;

  e.preventDefault();
  const form = e.target; // referencia directa

  const email = form.querySelector("#email").value.trim();
  const contrasena = form.querySelector("#password").value.trim();

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, contrasena }),
    });

    const data = await res.json();

    if (res.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      switch (data.user.rol.toUpperCase()) {
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
          alert("Rol no reconocido.");
      }
    } else {
      form.querySelector("#login-error").textContent = data.message || "Credenciales incorrectas.";
    }
  } catch (err) {
    console.error("Login error:", err);
    form.querySelector("#login-error").textContent = "Error del servidor. Intenta más tarde.";
  }
});
