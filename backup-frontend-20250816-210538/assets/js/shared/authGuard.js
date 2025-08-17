// frontend/assets/js/shared/authGuard.js
export function requireRole(expectedRole) {
  const userRaw = localStorage.getItem("user");
  const user = userRaw ? JSON.parse(userRaw) : null;

  // Si no hay usuario o el rol no coincide, redirige
  if (!user || user.rol?.toUpperCase() !== expectedRole.toUpperCase()) {
    // ⚠️ Usa siempre la ruta relativa adecuada a tu estructura
    window.location.href = "/index.html?login=true";
  }
}
