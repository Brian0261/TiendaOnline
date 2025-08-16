/******************************************************************
 *  Sugerencias de búsqueda (type-ahead)         – Versión sin
 *  “return” en el top-level y con espera al navbar si aún no existe
 ******************************************************************/
import { getProducts } from "./api.js";

const DEBOUNCE_MS = 300;
let timer, dropdown;

/* ───────────────────────── Bootstrap ────────────────────────── */
initOrWait(); // arranque inmediato

/* Si el navbar todavía no estaba, vuelve a intentar cuando cargue */
window.addEventListener("partials:loaded", initOrWait);

/* ───────────────────────── Funciones ────────────────────────── */
function initOrWait() {
  const input = document.getElementById("search-input");
  if (!input || input.dataset.suggestions) return; // aún no o ya hecho

  /* Marca para no duplicar */
  input.dataset.suggestions = "ready";

  /* Contenedor <ul> */
  dropdown = document.createElement("ul");
  dropdown.id = "search-suggestions";
  dropdown.className = "list-group position-absolute w-100 shadow suggestions-dropdown d-none";
  input.parentElement.style.position = "relative"; // asegura contexto
  input.parentElement.appendChild(dropdown);

  /* Eventos */
  input.addEventListener("keyup", handleKeyup);
  document.addEventListener("click", e => {
    if (!dropdown.contains(e.target) && e.target !== input) hide();
  });
}

function handleKeyup(e) {
  const q = e.target.value.trim();
  clearTimeout(timer);

  if (q.length < 2) return hide(); // evita peticiones cortísimas

  timer = setTimeout(async () => {
    try {
      const products = await getProducts({ search: q, limit: 8 });
      render(products, q);
    } catch {
      hide();
    }
  }, DEBOUNCE_MS);
}

function render(products, q) {
  dropdown.innerHTML = "";
  if (!products.length) {
    dropdown.innerHTML = `<li class="list-group-item disabled">No encontramos productos. Prueba con otros términos.</li>`;
  } else {
    products.forEach(p => {
      const li = document.createElement("li");
      li.className = "list-group-item list-group-item-action d-flex align-items-center gap-2";
      li.innerHTML = `
        <img src="${p.image}" alt="" width="40" height="40"
             onerror="this.src='/assets/images/placeholder-product.png'">
        <span>${highlight(p.name, q)}</span>`;
      li.addEventListener("click", () => {
        window.location.href = `/products/detail.html?id=${p.id}`;
      });
      dropdown.appendChild(li);
    });
    /* Opción “ver todos” */
    const seeAll = document.createElement("li");
    seeAll.className = "list-group-item text-center fw-semibold";
    seeAll.textContent = "Ver todos los resultados";
    seeAll.addEventListener("click", () => {
      window.location.href = `/products/catalog.html?search=${encodeURIComponent(q)}`;
    });
    dropdown.appendChild(seeAll);
  }
  show();
}

function highlight(txt, term) {
  return txt.replace(new RegExp(`(${term})`, "ig"), "<mark>$1</mark>");
}

function hide() {
  dropdown.classList.add("d-none");
}
function show() {
  dropdown.classList.remove("d-none");
}
