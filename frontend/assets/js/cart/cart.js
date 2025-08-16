// frontend/assets/js/cart/cart.js
import { loadCart, removeProductFromCart, updateProductQuantity } from "/assets/js/shared/addToCart.js"; // <-- NUEVO
import { updateCartCounter } from "/assets/js/shared/cartUtils.js"; // <-- NUEVO
import showToast from "/assets/js/shared/toast.js"; // <-- default

function normalizeImagePath(path) {
  if (!path) return "";
  if (path.startsWith("/") || path.startsWith("http")) return path;
  return `/${path.replace(/^(\.\/|(\.\.\/)+)/, "")}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const cartItemsBody = document.getElementById("cart-items-body");
  const cartContainer = document.getElementById("cart-container");
  const emptyCartMessage = document.getElementById("empty-cart-message");
  const cartSubtotalElement = document.getElementById("cart-subtotal");
  const cartShippingElement = document.getElementById("cart-shipping");
  const cartTotalElement = document.getElementById("cart-total");

  async function renderCart() {
    const cart = await loadCart(); // <-- ahora es asíncrono
    cartItemsBody.innerHTML = "";
    let subtotal = 0;
    const shipping = 5;

    if (!cart || cart.length === 0) {
      emptyCartMessage.style.display = "block";
      cartContainer.style.display = "none";
      updateCartSummary(0, shipping);
      return;
    }

    emptyCartMessage.style.display = "none";
    cartContainer.style.display = "block";

    cart.forEach(item => {
      const itemSubtotal = item.product.price * item.quantity;
      subtotal += itemSubtotal;

      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>
          <div class="d-flex align-items-center">
            <img src="${normalizeImagePath(item.product.image)}"
                 class="cart-item-img me-3"
                 alt="${item.product.name}"
                 onerror="this.src='/assets/images/placeholder-product.png'" />
            <div>
              <h6 class="mb-0">${item.product.name}</h6>
              <small class="text-muted cart-item-extra">${item.product.description || ""}</small>
            </div>
          </div>
        </td>
        <td>${item.product.description || item.product.descripcion || ""}</td>
        <td class="text-center">S/ ${item.product.price.toFixed(2)}</td>
        <td class="text-center">
          <div class="quantity-control">
            <button class="btn btn-outline-secondary btn-sm quantity-btn decrease-quantity" data-product-id="${item.product.id}">-</button>
            <input type="number" class="form-control quantity-input" value="${item.quantity}" min="1" data-product-id="${item.product.id}" />
            <button class="btn btn-outline-secondary btn-sm quantity-btn increase-quantity" data-product-id="${item.product.id}">+</button>
          </div>
        </td>
        <td class="text-center fw-bold">S/ ${itemSubtotal.toFixed(2)}</td>
        <td class="text-center">
          <button class="btn btn-danger btn-sm remove-item" data-product-id="${item.product.id}">
            <i class="fas fa-trash"></i>
          </button>
        </td>
      `;
      cartItemsBody.appendChild(fila);
    });

    updateCartSummary(subtotal, shipping);
  }

  function updateCartSummary(subtotal, shipping) {
    const total = subtotal + shipping;
    cartSubtotalElement.textContent = `S/ ${subtotal.toFixed(2)}`;
    cartShippingElement.textContent = `S/ ${shipping.toFixed(2)}`;
    cartTotalElement.textContent = `S/ ${total.toFixed(2)}`;
  }

  // Delegación de eventos
  document.addEventListener("click", async event => {
    const btn = event.target.closest(".quantity-btn");
    const removeBtn = event.target.closest(".remove-item");

    if (btn) {
      const productId = btn.dataset.productId;
      const isIncrease = btn.classList.contains("increase-quantity");
      const input = btn.parentNode.querySelector(".quantity-input");
      let newQty = parseInt(input.value, 10) || 1;
      newQty = isIncrease ? newQty + 1 : newQty - 1;

      if (newQty < 1) {
        await removeProductFromCart(productId);
        showToast("Producto eliminado", "El producto fue eliminado del carrito.", "danger");
      } else {
        await updateProductQuantity(productId, newQty);
      }
      await renderCart();
      await updateCartCounter();
      return;
    }

    if (removeBtn) {
      const productId = removeBtn.dataset.productId;
      await removeProductFromCart(productId);
      showToast("Producto eliminado", "El producto fue eliminado del carrito.", "danger");
      await renderCart();
      await updateCartCounter();
    }
  });

  document.addEventListener("change", async e => {
    if (e.target.classList.contains("quantity-input")) {
      const productId = e.target.dataset.productId;
      const newQuantity = parseInt(e.target.value, 10);
      if (newQuantity > 0) {
        await updateProductQuantity(productId, newQuantity);
        showToast("Cantidad actualizada", "La cantidad del producto ha sido modificada.");
      } else {
        await removeProductFromCart(productId);
        showToast("Producto eliminado", "El producto fue eliminado del carrito.", "danger");
      }
      await renderCart();
      await updateCartCounter();
    }
  });

  // Bootstrap
  (async () => {
    await renderCart();
    await updateCartCounter();
  })();
});
