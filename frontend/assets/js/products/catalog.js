// frontend/assets/js/products/catalog.js
// -------------------------------------------------------------
// Catálogo de productos + búsqueda, filtros y paginación
// -------------------------------------------------------------
import { getProducts, getCategories } from "../shared/api.js";
import { addProductToCart } from "../shared/addToCart.js";
import { updateCartCounter } from "../shared/cartUtils.js";
import { onCatalogRefresh } from "../shared/pubsub.js";
import showToast from "../shared/toast.js";

/* 🔧 utilidades seguras */
const toNumber = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const formatPrice = v => toNumber(v).toFixed(2);

/* 🔄  Estado global */
let currentPage = 1;
let totalPages = 1;
let currentCategory = ""; // id numérico ("" = todas)
let currentSort = "nuevo"; // más recientes primero
let currentLimit = 10;
let currentSearch = "";

let categories = []; // caché de categorías

/* Elementos dependientes del navbar */
let searchForm = null;
let searchInput = null;

/* ─────────── Init flexible ─────────── */
async function init() {
  // ---- refs que existen desde el principio ----
  const productGrid = document.getElementById("product-grid");
  const categorySelect = document.getElementById("category-select");
  const sortSelect = document.getElementById("sort-select");
  const limitSelect = document.getElementById("limit-select");
  const noResults = document.getElementById("no-results");
  const pagination = document.getElementById("pagination");

  if (sortSelect) sortSelect.value = "nuevo";

  /* 0️⃣ Lee ?search=… si llegó desde la barra superior */
  const urlParams = new URLSearchParams(window.location.search);
  currentSearch = urlParams.get("search") || "";

  /* 1️⃣ Cargar categorías y poblar combo */
  try {
    categories = await getCategories(); // [{id,name}]
    populateCategorySelect();
  } catch (err) {
    console.error("Error cargando categorías:", err);
  }

  /* 2️⃣ Listeners de filtros */
  categorySelect.addEventListener("change", async e => {
    currentCategory = e.target.value;
    currentPage = 1;
    await loadProducts();
  });

  sortSelect.addEventListener("change", async e => {
    currentSort = e.target.value;
    currentPage = 1;
    await loadProducts();
  });

  limitSelect.addEventListener("change", async e => {
    currentLimit = +e.target.value;
    currentPage = 1;
    await loadProducts();
  });

  /* 3️⃣ Buscador (navbar puede cargarse después) */
  bindSearchForm();
  window.addEventListener("partials:loaded", bindSearchForm);

  /* 4️⃣ Refresco automático desde el admin */
  onCatalogRefresh(async () => {
    currentPage = 1;
    await loadProducts();
  });

  /* 5️⃣ Primera carga + contador de carrito */
  await loadProducts();
  updateCartCounter();

  /* ───── funciones internas ───── */

  function populateCategorySelect() {
    categorySelect.innerHTML =
      '<option value="">Todas las categorías</option>' + categories.map(c => `<option value="${c.id}">${c.name}</option>`).join("");
  }

  function bindSearchForm() {
    if (searchForm) return; // evita doble binding
    searchForm = document.getElementById("search-form");
    searchInput = document.getElementById("search-input");
    if (!searchForm || !searchInput) return;

    if (currentSearch) searchInput.value = currentSearch;

    searchForm.addEventListener("submit", async e => {
      e.preventDefault();
      currentSearch = (searchInput.value || "").trim();
      currentPage = 1;

      const newUrl = new URL(window.location.href);
      if (currentSearch) newUrl.searchParams.set("search", currentSearch);
      else newUrl.searchParams.delete("search");
      history.replaceState(null, "", newUrl);

      await loadProducts();
    });
  }

  async function loadProducts() {
    try {
      /* 1️⃣ Parámetros opcionales */
      const params = {
        ...(currentSearch && { search: currentSearch }),
        ...(currentCategory && { category: currentCategory }),
      };
      let products = await getProducts(params); // ← ya normalizados en api.js
      console.log("Productos recibidos del backend:", products);

      /* 2️⃣ Ordenamiento cliente-side */
      products = sortProducts(products, currentSort);

      /* 3️⃣ Paginación cliente-side */
      totalPages = Math.ceil(products.length / currentLimit) || 1;
      const start = (currentPage - 1) * currentLimit;
      const end = start + currentLimit;
      const pageSlice = products.slice(start, end);

      /* 4️⃣ Render */
      if (pageSlice.length) {
        renderProducts(pageSlice);
        renderPagination();
        noResults.style.display = "none";
        productGrid.style.display = "flex";
      } else {
        productGrid.style.display = "none";
        noResults.style.display = "block";
        pagination.style.display = "none";
      }
    } catch (err) {
      console.error("Error al cargar productos:", err);
      productGrid.innerHTML = '<p class="text-danger">Error al cargar los productos. Intenta de nuevo más tarde.</p>';
    }
  }

  function sortProducts(arr, option) {
    const list = [...arr];
    switch (option) {
      case "precio_asc":
        return list.sort((a, b) => toNumber(a.price) - toNumber(b.price));
      case "precio_desc":
        return list.sort((a, b) => toNumber(b.price) - toNumber(a.price));
      case "nuevo": // id DESC
        return list.sort((a, b) => toNumber(b.id) - toNumber(a.id));
      case "popular":
        return list.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      default:
        return list;
    }
  }

  function renderProducts(products) {
    productGrid.innerHTML = "";
    products.forEach(prod => {
      const col = document.createElement("div");
      col.className = "col-md-4 col-lg-3";

      const stock = toNumber(prod.stock ?? 0);
      const outOfStock = stock <= 0;
      const disabled = outOfStock ? "disabled" : "";
      const stockMsg = outOfStock ? '<span class="text-danger">Agotado</span>' : `<span class="text-success">Disponible (${stock})</span>`;

      const imgSrc = prod.image || "/assets/images/placeholder-product.png";

      col.innerHTML = `
        <a href="/products/detail.html?id=${prod.id}"
           class="text-decoration-none text-reset d-block h-100">
          <div class="product-card card h-100">
            <img src="${imgSrc}"
                 class="card-img-top product-img"
                 alt="${String(prod.name || "Producto")}"
                 onerror="this.src='/assets/images/placeholder-product.png'"/>
            <div class="card-body">
              <h5 class="card-title">${prod.name || "Producto"}</h5>
              <p class="card-text text-muted">
                ${prod.description || "Producto de calidad"}
              </p>
              <div class="mb-2">${stockMsg}</div>
              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-bold text-primary-custom">
                  S/ ${formatPrice(prod.price)}
                </span>
                <button class="btn btn-sm btn-primary-custom add-to-cart-btn"
                        data-product-id="${prod.id}"
                        data-product-name="${prod.name || ""}"
                        data-product-price="${toNumber(prod.price)}"
                        data-product-image="${imgSrc}"
                        data-product-description="${prod.description || ""}"
                        ${disabled}>
                  <i class="fas fa-cart-plus"></i> Agregar
                </button>
              </div>
            </div>
          </div>
        </a>`;
      productGrid.appendChild(col);
    });

    /* Eventos Agregar al carrito */
    document.querySelectorAll(".add-to-cart-btn").forEach(btn => {
      btn.addEventListener("click", async e => {
        e.preventDefault();
        e.stopPropagation(); // evita que el <a> navegue
        const d = e.currentTarget.dataset;
        const producto = products.find(p => String(p.id) === String(d.productId)) || {
          id: d.productId,
          name: d.productName,
          price: toNumber(d.productPrice),
          image: d.productImage,
          description: d.productDescription || "",
        };

        await addProductToCart({
          id: producto.id,
          name: producto.name,
          price: toNumber(producto.price),
          image: producto.image,
          description: producto.description || "",
        });

        await updateCartCounter();
        showToast("¡Agregado!", `${producto.name} agregado al carrito`, "success");
      });
    });
  }

  function renderPagination() {
    if (totalPages <= 1) {
      pagination.style.display = "none";
      return;
    }
    pagination.style.display = "block";

    let html = `
      <ul class="pagination justify-content-center">
        <li class="page-item ${currentPage === 1 ? "disabled" : ""}">
          <a class="page-link" href="#" data-page="${currentPage - 1}">Anterior</a>
        </li>`;

    for (let i = 1; i <= totalPages; i++) {
      html += `
        <li class="page-item ${currentPage === i ? "active" : ""}">
          <a class="page-link" href="#" data-page="${i}">${i}</a>
        </li>`;
    }

    html += `
        <li class="page-item ${currentPage === totalPages ? "disabled" : ""}">
          <a class="page-link" href="#" data-page="${currentPage + 1}">Siguiente</a>
        </li>
      </ul>`;

    pagination.innerHTML = html;

    pagination.querySelectorAll(".page-link").forEach(link => {
      link.addEventListener("click", async e => {
        e.preventDefault();
        const p = +e.currentTarget.dataset.page;
        if (p && p !== currentPage && p >= 1 && p <= totalPages) {
          currentPage = p;
          await loadProducts();
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
  }
}

/* --- bootstrap de este módulo --- */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
