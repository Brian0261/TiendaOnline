/******************************************************************
 * frontend/assets/js/cart/checkout.js
 * Envío fijo: S/ 5.00 (DOMICILIO) / S/ 0.00 (RECOJO)
 * - Recojo en tienda con única sede (Almacén Central)
 * - Resumen de envío siempre visible
 * - Radios DOMICILIO → RECOJO
 ******************************************************************/
import api, { getCart, addToCart, createOrder, getDeliveryConfig, payIzipayInit, payIzipayMockConfirm } from "/assets/js/shared/api.js";
import showToast from "/assets/js/shared/toast.js";

/* ------------ Constantes ------------ */
const SHIPPING_FIXED = 5;
const DELIVERY_KEY = "checkout_delivery_type";

/* ------------ Estado ------------ */
let CART = [];
let ORDER = null;

/* Google Maps */
let gmap = null,
  gmarker = null,
  gautocomplete = null,
  ggeocoder = null;

/* Config de reparto y sede (se obtiene del backend) */
let DELIVERY = {
  store: {
    name: "Almacén Central",
    address: "Av. Principal 123, Lima",
    lat: -12.046373,
    lng: -77.042754,
    phone: "(01) 123-4567",
    hours: "Lun-Sáb 9:00-9:00 · Dom 9:00-6:00",
  },
  pricing: { base: SHIPPING_FIXED },
};

const steps = Array.from(document.querySelectorAll("[data-step]"));
const btnNext = document.querySelectorAll("[data-next]");
const btnPrev = document.querySelectorAll("[data-prev]");

/* Campos */
const inputDireccion = document.getElementById("direccion");
const btnGeolocate = document.getElementById("btnGeolocate");

/* Panel derecho */
const cartBox = document.getElementById("checkout-cart-items");
const shippingRow = document.getElementById("shipping-summary");
const shippingLabel = document.getElementById("shipping-label");
const shippingAmount = document.getElementById("shipping-amount");
const totalSpan = document.getElementById("total-pagar");

/* Recojo en tienda – elementos */
const pickupWrap = document.getElementById("pickup-wrap");
const pickupName = document.getElementById("pickup-name");
const pickupAddr = document.getElementById("pickup-address");
const pickupPhone = document.getElementById("pickup-phone");
const pickupHours = document.getElementById("pickup-hours");

/* Selección persistida */
let deliveryType = localStorage.getItem(DELIVERY_KEY) || "DOMICILIO";

/* ------------ Init ------------ */
init();

async function init() {
  try {
    const cfg = await getDeliveryConfig();
    if (cfg && cfg.store) DELIVERY = cfg;
  } catch {}

  setDeliveryRadiosFromState();
  renderPickupCard(); // pinta la tarjeta del almacén

  bindReceiptToggle();
  wireDeliveryToggles();
  bindInputs();

  // 👇 Si venimos del pago (?ok=1), vaciamos carrito, mostramos éxito y limpiamos la URL
  await handleReturnFromPayment();

  await renderCart(true);
  recalcTotal(); // pinta el resumen desde paso 1
}

/* ------------ Navegación ------------ */
btnNext.forEach(b => b.addEventListener("click", goNext));
btnPrev.forEach(b => b.addEventListener("click", goPrev));

function goNext(e) {
  e.preventDefault();
  const i = steps.findIndex(s => !s.hasAttribute("hidden"));
  if (i === 0 && !validateStep1()) return;
  if (i === 1 && !validateStep2()) return;
  showStep(i + 1);
}
function goPrev(e) {
  e.preventDefault();
  const i = steps.findIndex(s => !s.hasAttribute("hidden"));
  showStep(Math.max(0, i - 1));
}
function showStep(i) {
  steps.forEach((s, idx) => (idx === i ? s.removeAttribute("hidden") : s.setAttribute("hidden", "")));
  recalcTotal();
}

/* ------------ UI ------------ */
function bindReceiptToggle() {
  const radios = document.querySelectorAll('input[name="comp"]');
  const boleta = document.querySelector(".boleta-fields");
  const factura = document.querySelector(".factura-fields");
  const toggle = () => {
    const t = document.querySelector('input[name="comp"]:checked')?.value || "BOLETA";
    t === "BOLETA"
      ? (boleta?.removeAttribute("hidden"), factura?.setAttribute("hidden", ""))
      : (factura?.removeAttribute("hidden"), boleta?.setAttribute("hidden", ""));
  };
  radios.forEach(r => r.addEventListener("change", toggle));
  toggle();
}

function setDeliveryRadiosFromState() {
  const r = document.querySelector(`input[name="envio"][value="${deliveryType}"]`);
  if (r) r.checked = true;
  toggleDeliveryFields(deliveryType === "DOMICILIO");
}

function wireDeliveryToggles() {
  const radios = document.querySelectorAll('input[name="envio"]');
  const onChange = async () => {
    deliveryType = document.querySelector('input[name="envio"]:checked')?.value || "DOMICILIO";
    localStorage.setItem(DELIVERY_KEY, deliveryType);

    const showHome = deliveryType === "DOMICILIO";
    toggleDeliveryFields(showHome);

    if (showHome) await initDeliveryMap();
    recalcTotal();
  };
  radios.forEach(r => r.addEventListener("change", onChange));
  onChange(); // aplica al cargar
}

function bindInputs() {
  btnGeolocate?.addEventListener("click", () => geolocateUser());
}

function toggleDeliveryFields(showHome) {
  document.querySelectorAll(".envio-fields").forEach(el => (showHome ? el.removeAttribute("hidden") : el.setAttribute("hidden", "")));
  document.querySelectorAll(".pickup-fields").forEach(el => (showHome ? el.setAttribute("hidden", "") : el.removeAttribute("hidden")));
}

/* ------------ Tarjeta del almacén (Recojo) ------------ */
function renderPickupCard() {
  if (!pickupWrap) return;
  pickupName.textContent = DELIVERY.store.name || "Almacén Central";
  pickupAddr.textContent = DELIVERY.store.address || "Av. Principal 123, Lima";
  pickupPhone.textContent = DELIVERY.store.phone || "(01) 123-4567";
  pickupHours.textContent = DELIVERY.store.hours || "Lun-Sáb 9:00-9:00 · Dom 9:00-6:00";
}

/* ------------ Google Maps ------------ */
async function loadGoogleMaps() {
  if (window.google?.maps?.places) return;

  const exist = Array.from(document.scripts).find(s => s.src.includes("maps.googleapis.com/maps/api/js"));
  if (exist)
    return new Promise((res, rej) => {
      exist.onload = res;
      exist.onerror = rej;
    });

  const resp = await fetch("/api/config/maps-key").catch(() => null);
  const { key } = (await resp?.json().catch(() => ({}))) || {};
  if (!key) throw new Error("Google Maps API key no configurada");

  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`;
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function initDeliveryMap() {
  try {
    await loadGoogleMaps();
  } catch {
    return;
  }
  const mapEl = document.getElementById("map");
  if (!mapEl || !inputDireccion) return;

  const center = { lat: DELIVERY.store.lat, lng: DELIVERY.store.lng };

  if (!gmap) {
    gmap = new google.maps.Map(mapEl, { center, zoom: 13 });
    gmarker = new google.maps.Marker({ map: gmap, position: center, draggable: true });
    ggeocoder = new google.maps.Geocoder();

    gautocomplete = new google.maps.places.Autocomplete(inputDireccion, {
      fields: ["formatted_address", "geometry"],
      componentRestrictions: { country: ["pe"] },
    });
    gautocomplete.addListener("place_changed", () => {
      const place = gautocomplete.getPlace();
      if (!place?.geometry) return;
      const loc = place.geometry.location;
      gmap.setCenter(loc);
      gmarker.setPosition(loc);
      setLocation(loc.lat(), loc.lng(), place.formatted_address || inputDireccion.value);
    });

    gmarker.addListener("dragend", ({ latLng }) => {
      reverseGeocode(latLng.lat(), latLng.lng());
    });
  } else {
    google.maps.event.trigger(gmap, "resize");
  }
}

function setLocation(lat, lng, formattedAddress = "") {
  inputDireccion.dataset.lat = String(lat);
  inputDireccion.dataset.lng = String(lng);
  if (formattedAddress) inputDireccion.value = formattedAddress;
  recalcTotal();
}
function reverseGeocode(lat, lng) {
  if (!ggeocoder) return setLocation(lat, lng);
  ggeocoder.geocode({ location: { lat, lng } }, (results, status) => {
    if (status === "OK" && results?.length) setLocation(lat, lng, results[0].formatted_address);
    else setLocation(lat, lng);
  });
}
function geolocateUser() {
  if (!navigator.geolocation) return showToast("Geolocalización", "Tu navegador no permite obtener la ubicación.", "warning");
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude, longitude } = pos.coords;
      const latLng = new google.maps.LatLng(latitude, longitude);
      gmap?.setCenter(latLng);
      gmarker?.setPosition(latLng);
      reverseGeocode(latitude, longitude);
    },
    () => showToast("Geolocalización", "No se pudo obtener tu ubicación.", "warning"),
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

/* ------------ Carrito ------------ */
async function renderCart(withSync = false) {
  try {
    let data = await getCart();
    let items = Array.isArray(data) ? data : data?.items || data?.cart || [];

    if (withSync && (!items || items.length === 0)) {
      const local = JSON.parse(localStorage.getItem("shoppingCart") || "[]");
      const toSync = local
        .map(i => ({ id_producto: i.product?.id ?? i.id, cantidad: i.quantity ?? i.cantidad ?? 1 }))
        .filter(i => i.id_producto && i.cantidad > 0);

      for (const it of toSync) await addToCart(it);
      data = await getCart();
      items = Array.isArray(data) ? data : data?.items || data?.cart || [];
    }

    if (!items?.length) {
      cartBox.innerHTML = `<div class="alert alert-warning">Tu carrito está vacío.</div>`;
      CART = [];
      recalcTotal();
      return;
    }

    CART = items.map(it => {
      const rawImg = it.imagen ?? it.product?.image ?? it.image ?? "/assets/images/default.webp";
      const image = rawImg?.startsWith("/") || rawImg?.startsWith("http") ? rawImg : `/${String(rawImg).replace(/^(\.\/|(\.\.\/)+)/, "")}`;
      return {
        id: it.id_producto ?? it.product?.id ?? it.id,
        name: it.nombre_producto ?? it.product?.name ?? it.name,
        price: Number(it.precio ?? it.product?.price ?? it.price ?? 0),
        qty: Number(it.cantidad ?? it.quantity ?? 1),
        image,
      };
    });

    cartBox.innerHTML = CART.map(
      p => `
      <div class="d-flex align-items-center justify-content-between py-2 border-bottom">
        <div class="d-flex align-items-center gap-3">
          <img src="${p.image}" alt="${p.name}" width="54" height="54" class="rounded border"
               onerror="this.src='/assets/images/placeholder-product.png'"/>
          <div>
            <div class="fw-semibold">${p.name}</div>
            <small class="text-muted">S/ ${p.price.toFixed(2)} × ${p.qty}</small>
          </div>
        </div>
        <div class="fw-bold">S/ ${(p.price * p.qty).toFixed(2)}</div>
      </div>
    `
    ).join("");

    recalcTotal();
  } catch (err) {
    console.error(err);
    cartBox.innerHTML = `<div class="alert alert-danger">No se pudo cargar el carrito. Inicia sesión.</div>`;
  }
}

/* ------------ Totales ------------ */
function recalcTotal() {
  const radio = document.querySelector('input[name="envio"]:checked');
  deliveryType = radio ? radio.value : deliveryType;
  localStorage.setItem(DELIVERY_KEY, deliveryType);

  const subtotal = CART.reduce((s, p) => s + p.price * p.qty, 0);
  const shipping = deliveryType === "DOMICILIO" ? SHIPPING_FIXED : 0;

  if (shippingLabel) shippingLabel.textContent = deliveryType === "DOMICILIO" ? "a domicilio" : "en tienda";
  if (shippingAmount) shippingAmount.textContent = `S/ ${shipping.toFixed(2)}`;

  const total = subtotal + shipping;
  if (totalSpan) totalSpan.textContent = `S/ ${total.toFixed(2)}`;
}

/* ------------ Validaciones ------------ */
function validateStep1() {
  const tipo = document.querySelector('input[name="comp"]:checked')?.value || "BOLETA";
  if (tipo === "BOLETA") {
    const dni = document.getElementById("dni").value.trim();
    if (!dni) return showToast("Falta DNI", "Ingresa tu DNI para la boleta", "warning"), false;
  } else {
    const ruc = document.getElementById("ruc").value.trim();
    const rs = document.getElementById("razon_social").value.trim();
    if (!ruc || !rs) return showToast("Datos incompletos", "RUC y Razón social son obligatorios", "warning"), false;
  }
  return true;
}
function validateStep2() {
  if (deliveryType === "DOMICILIO") {
    const dir = document.getElementById("direccion").value.trim();
    if (!dir) return showToast("Dirección requerida", "Ingresa tu dirección para el envío", "warning"), false;
  }
  return true;
}

/* ------------ Pago ------------ */
document.getElementById("btnPagar")?.addEventListener("click", async e => {
  e.preventDefault();
  try {
    const receiptType = document.querySelector('input[name="comp"]:checked')?.value || "BOLETA";
    const metodo = document.querySelector('input[name="pay"]:checked')?.value || "TARJETA";

    const envio = deliveryType;
    const shippingCost = deliveryType === "DOMICILIO" ? SHIPPING_FIXED : 0;
    const address = envio === "DOMICILIO" ? document.getElementById("direccion").value.trim() : `${DELIVERY.store.name} – ${DELIVERY.store.address}`;

    const receiptData =
      receiptType === "BOLETA"
        ? { nombre: document.getElementById("nombre_boleta").value.trim(), dni: document.getElementById("dni").value.trim() }
        : {
            razon_social: document.getElementById("razon_social").value.trim(),
            ruc: document.getElementById("ruc").value.trim(),
            direccion: document.getElementById("dir_fiscal").value.trim(),
          };

    const paymentMethodId = { TARJETA: 4, YAPE: 1, PLIN: 2 }[metodo] || 4;

    const order = await createOrder({
      deliveryType: envio,
      address,
      shippingCost,
      receiptType,
      receiptData,
      paymentMethodId,
    });
    ORDER = order;

    const init = await payIzipayInit({ orderId: order.orderId, method: metodo });
    if (init.mode === "mock") {
      await payIzipayMockConfirm({ orderId: order.orderId, receiptType, receiptData, paymentMethodId });
      showToast("¡Pago exitoso!", `Pedido #${order.orderId} confirmado`, "success");
      // Redirige con bandera para que el propio checkout maneje el éxito
      window.location.href = "/cart/checkout.html?ok=1&order=" + order.orderId;
      return;
    }
    if (init.mode === "redirect" && init.redirectUrl) {
      window.location.href = init.redirectUrl;
      return;
    }
    showToast("Pago", "Modo de pago no soportado aún", "warning");
  } catch (err) {
    console.error(err);
    showToast("Error", "No se pudo procesar tu pago", "danger");
  }
});

/* ------------ Post-pago (?ok=1) ------------ */
async function handleReturnFromPayment() {
  const params = new URLSearchParams(location.search);
  if (params.get("ok") !== "1") return; // nada que hacer

  const orderId = params.get("order") || "";

  // Intenta vaciar carrito en servidor (si la API lo soporta)
  try {
    await api.del("/cart", true);
  } catch (e) {
    // fallback: limpia carrito local si existiera
    try {
      localStorage.removeItem("shoppingCart");
    } catch {}
  }

  // Mensaje y paso final (si existe sección de éxito)
  showToast("¡Pago exitoso!", `Pedido #${orderId} confirmado`, "success");

  // Si tienes un paso de éxito, muéstralo
  try {
    showStep(steps.length - 1);
    const span = document.getElementById("success-order-id");
    if (span) span.textContent = orderId;
  } catch {}

  // Limpia query params para evitar repetir lógica al refrescar
  history.replaceState(null, "", "/cart/checkout.html");
}
