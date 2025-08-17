document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("register-form");
  const nombreInput = document.getElementById("nombre");
  const apellidoInput = document.getElementById("apellido");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const telefonoInput = document.getElementById("telefono");
  const direccionInput = document.getElementById("direccion");

  // Asegúrate que existe este div para mostrar errores
  let errorDiv = document.getElementById("error-message");
  if (!errorDiv) {
    errorDiv = document.createElement("div");
    errorDiv.id = "error-message";
    errorDiv.className = "alert alert-danger mt-2";
    errorDiv.style.display = "none";
    form.parentNode.insertBefore(errorDiv, form);
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();

    const nombre = nombreInput.value.trim();
    const apellido = apellidoInput.value.trim();
    const email = emailInput.value.trim();
    const contrasena = passwordInput.value.trim();
    const telefono = telefonoInput.value.trim();
    const direccion_principal = direccionInput.value.trim();

    // Validación de campos
    if (!nombre || !apellido || !email || !contrasena || !direccion_principal) {
      showError("Todos los campos obligatorios deben ser llenados.");
      return;
    }

    if (contrasena.length < 8 || !/[A-Z]/.test(contrasena) || !/[0-9]/.test(contrasena)) {
      showError("La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.");
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre,
          apellido,
          email,
          contrasena,
          telefono,
          direccion_principal,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        showError(data.message || "Error al registrar usuario");
        return;
      }

      // Registro exitoso y login automático
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirección según rol
      if (data.user.rol === "ADMINISTRADOR") {
        window.location.href = "/views/dashboard/admin.html";
      } else if (data.user.rol === "EMPLEADO") {
        window.location.href = "/views/dashboard/employee.html";
      } else {
        window.location.href = "/views/dashboard/customer.html";
      }
    } catch (error) {
      showError("Error de conexión con el servidor.");
    }
  });

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = "block";
  }
});
