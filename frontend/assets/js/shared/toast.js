/******************************************************************
 * Toast minimalista compatible con 2 formatos:
 *  1) showToast(titulo, mensaje, tipo?, duracion?)
 *  2) showToast(mensaje, tipo?, duracion?)
 ******************************************************************/
export function showToast(a, b, c, d) {
  const TIPOS = new Set(["success", "danger", "warning", "info", "primary", "secondary", "dark", "light"]);

  let titulo = "";
  let mensaje = "";
  let tipo = "success";
  let duracion = 4000;

  // --- Detección de firma ---
  if (typeof c !== "undefined" || typeof d !== "undefined") {
    // Formato 1: (titulo, mensaje, tipo?, duracion?)
    titulo = a ?? "";
    mensaje = b ?? "";
    tipo = TIPOS.has(c) ? c : "success";
    duracion = Number.isFinite(d) ? d : 4000;
  } else {
    // Formato 2: (mensaje, tipo?, duracion?)
    mensaje = a ?? "";
    if (TIPOS.has(b)) {
      tipo = b;
    } else if (typeof b === "number") {
      duracion = b;
    }
    // Título por defecto según tipo
    const mapTitulo = {
      success: "Éxito",
      danger: "Error",
      warning: "Atención",
      info: "Info",
      primary: "",
      secondary: "",
      dark: "",
      light: "",
    };
    titulo = mapTitulo[tipo] ?? "";
  }

  // 1) Contenedor único
  let cont = document.getElementById("toast-container");
  if (!cont) {
    cont = document.createElement("div");
    cont.id = "toast-container";
    cont.className = "toast-container position-fixed bottom-0 end-0 p-3";
    document.body.appendChild(cont);
  }

  // 2) Toast
  const toast = document.createElement("div");
  toast.className = `toast align-items-center text-bg-${tipo} border-0`;
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "assertive");
  toast.setAttribute("aria-atomic", "true");

  // Botón close blanco solo en fondos oscuros
  const closeWhite = ["dark", "danger", "success", "primary", "secondary"].includes(tipo) ? "btn-close-white" : "";

  // Si hay título, lo mostramos en <strong>; si no, solo el mensaje
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        ${titulo ? `<strong class="me-2">${titulo}</strong>` : ""}
        ${mensaje}
      </div>
      <button type="button" class="btn-close ${closeWhite} me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  // 3) Mostrar y limpiar
  cont.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast, { delay: duracion });
  bsToast.show();
  toast.addEventListener("hidden.bs.toast", () => toast.remove());
}

export default showToast;
