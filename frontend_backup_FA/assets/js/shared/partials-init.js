// frontend/assets/js/shared/partials-init.js
import { loadPartial } from "/assets/js/shared/loadPartials.js";
import { updateCartCounter } from "/assets/js/shared/cartUtils.js";
import { verificarSesion } from "/assets/js/main.js";

(async () => {
  try {
    // 1) Inserta navbar, footer y modal en paralelo
    await Promise.all([
      loadPartial("#navbar-container", "/partials/navbar.html"),
      loadPartial("#footer-container", "/partials/footer.html"),
      loadPartial("#modal-container", "/partials/loginModal.html"),
    ]);

    // 2) Inicializaciones que dependen de los parciales ya en el DOM
    if (typeof verificarSesion === "function") {
      await verificarSesion(); // soporta sync o async
    }
    await updateCartCounter(); // backend-first, fallback localStorage

    // 3) Carga diferida de scripts que usan los parciales
    await Promise.allSettled([import("/assets/js/auth/login.js"), import("/assets/js/shared/searchSuggestions.js")]);

    // 4) Notifica a otros módulos que todo está listo
    window.dispatchEvent(new Event("partials:loaded"));
    document.dispatchEvent(new Event("partials:loaded"));
  } catch (err) {
    console.error("[partials-init] Error inicializando parciales:", err);
  }
})();
