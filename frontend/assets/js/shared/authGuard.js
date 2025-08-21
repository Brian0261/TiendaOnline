// frontend/assets/js/shared/authGuard.js
 export function requireRole(expectedRole) {
   const userRaw =
     localStorage.getItem("auth_user") || localStorage.getItem("user");
   let user = null;
   try { user = userRaw ? JSON.parse(userRaw) : null; } catch {}

   const ok =
     user && user.rol && user.rol.toUpperCase() === expectedRole.toUpperCase();
   if (!ok) {
     // Home funciona en local (Express) y en Pages (/_redirects)
     window.location.href = "/?login=true";
   }
 }