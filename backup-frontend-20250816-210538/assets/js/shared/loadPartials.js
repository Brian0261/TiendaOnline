/**
 * Inserta HTML remoto dentro de un elemento del documento.
 * @param {string} selector  Ej. "#navbar-container"
 * @param {string} url       Ej. "/partials/navbar.html"
 * @returns {Promise<void>}  Permite encadenar lógica tras la carga
 */
export async function loadPartial(selector, url) {
  const host = document.querySelector(selector);
  if (!host) return Promise.resolve();
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    host.innerHTML = await res.text();
    return Promise.resolve();
  } catch (err) {
    console.error(`Error al cargar ${url}:`, err);
    return Promise.reject(err);
  }
}
