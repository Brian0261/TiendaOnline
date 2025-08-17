/******************************************************************
 *  Logout helper – borra token y vuelve al home, con confirmación modal
 *  Ahora acepta múltiples selectores: bindLogout('#logout-btn', '#logout-btn-side')
 ******************************************************************/
export default function bindLogout(...btnSelectors) {
  // Selección por defecto si no se envía nada
  if (!btnSelectors || btnSelectors.length === 0) btnSelectors = ["#logout-btn"];

  // Aceptar array o parámetros sueltos; combinar en un único selector CSS
  const combinedSelector = btnSelectors.flat().join(",");

  // Inyecta el modal una sola vez
  if (!document.getElementById("logoutModal")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
      <div class="modal fade" id="logoutModal" tabindex="-1" aria-labelledby="logoutModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title" id="logoutModalLabel">¿Cerrar sesión?</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              ¿Estás seguro de que deseas cerrar sesión?
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
              <button type="button" class="btn btn-danger" id="confirmLogoutBtn">Cerrar sesión</button>
            </div>
          </div>
        </div>
      </div>
    `
    );
  }

  const modalEl = document.getElementById("logoutModal");
  let bsModal = null;

  // Evita listeners duplicados si se llama más de una vez
  document.removeEventListener("click", window.__logoutListener__);
  window.__logoutListener__ = function (e) {
    const btn = e.target.closest(combinedSelector);
    if (!btn) return;
    e.preventDefault();
    bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
  };

  document.addEventListener("click", window.__logoutListener__);

  document.removeEventListener("click", window.__logoutModalListener__);
  window.__logoutModalListener__ = function (e) {
    if (e.target && e.target.id === "confirmLogoutBtn") {
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      } finally {
        if (bsModal) bsModal.hide();
        // replace() para que no puedan volver con "Atrás" a una vista protegida
        window.location.replace("/");
      }
    }
  };
  document.addEventListener("click", window.__logoutModalListener__);
}
