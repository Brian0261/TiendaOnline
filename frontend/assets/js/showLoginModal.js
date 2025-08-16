document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("login") === "true") {
    const loginModal = new bootstrap.Modal(document.getElementById("loginModal"));
    loginModal.show();
  }
});
