// frontend/assets/js/products/detail.js
import { getProductById } from "/assets/js/shared/api.js";
import { addProductToCart } from "/assets/js/shared/addToCart.js";
import { updateCartCounter } from "/assets/js/shared/cartUtils.js";
import showToast from "/assets/js/shared/toast.js";

const qs = new URLSearchParams(location.search);
const id = qs.get("id");

function normalizeImagePath(path) {
  if (!path) return "/assets/images/placeholder-product.png";
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return `/${path.replace(/^(\.\/|(\.\.\/)+)/, "")}`;
}

(async function init() {
  if (!id) {
    document.getElementById("p-name").textContent = "Producto no especificado";
    return;
  }
  try {
    // La API puede devolver {product}, {data}, un array, o el objeto directo
    const raw = await getProductById(id);
    const p = raw?.product || raw?.data || (Array.isArray(raw) ? raw[0] : raw) || {};

    const product = {
      id: p.id_producto ?? p.id,
      name: p.nombre_producto ?? p.name ?? "Producto",
      price: Number(p.precio ?? p.price ?? 0),
      image: normalizeImagePath(p.imagen ?? p.image),
      description: p.descripcion ?? p.description ?? "",
    };

    // Pinta en la UI
    document.getElementById("p-image").src = product.image;
    document.getElementById("p-name").textContent = product.name;
    document.getElementById("p-desc").textContent = product.description;
    document.getElementById("p-price").textContent = product.price.toFixed(2);

    // Botón Agregar
    document.getElementById("btnAdd").addEventListener("click", async () => {
      const qty = Math.max(1, parseInt(document.getElementById("qty").value, 10) || 1);
      await addProductToCart(product, qty);
      await updateCartCounter();
      showToast("¡Agregado!", `${product.name} × ${qty}`, "success");
    });
  } catch (err) {
    console.error("[detail] error:", err);
    showToast("Error", "No se pudo cargar el producto", "danger");
  }
})();
