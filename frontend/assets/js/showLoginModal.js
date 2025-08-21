document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("login") === "true") {
    const loginModal = new bootstrap.Modal(document.getElementById("loginModal"));
    loginModal.show();
  }

  // Rellenar datalist cuando se abra el modal
  const el = document.getElementById("loginModal");
  if (el) {
    el.addEventListener("shown.bs.modal", () => {
      try {
        const key = "login_emails";
        const emails = JSON.parse(localStorage.getItem(key) || "[]");
        const dl = document.getElementById("login-email-history");
        if (!dl) return;
        dl.innerHTML = emails.map(e => `<option value="${e}"></option>`).join("");
      } catch {}
    });
  }
});
