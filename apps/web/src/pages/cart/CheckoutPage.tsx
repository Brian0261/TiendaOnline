import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/http";
import { clearCart, loadCart } from "../../cart/cartService";
import { useAuth } from "../../auth/useAuth";

type DeliveryConfig = {
  store: {
    name: string;
    address: string;
    lat: number;
    lng: number;
    phone?: string;
    hours?: string;
  };
  pricing: {
    base: number;
  };
};

type DraftOrderResponse = {
  orderId: number;
  subtotal: number;
  shipping: number;
  total: number;
  receiptType?: "BOLETA" | "FACTURA";
  receiptData?: Record<string, unknown>;
  paymentMethodId?: number;
};

type IzipayInitResponse =
  | { mode: "mock"; orderId: number; total: number; method: string }
  | { mode: "redirect"; redirectUrl: string; provider?: string; preferenceId?: string | null }
  | { mode: string };

type HttpErrorLike = {
  message?: string;
  details?: unknown;
};

type GoogleMapsApi = {
  maps: {
    Map: new (el: HTMLElement, opts: { center: { lat: number; lng: number }; zoom: number }) => unknown;
    Marker: new (opts: { map: unknown; position: { lat: number; lng: number }; draggable: boolean }) => {
      addListener: (eventName: string, handler: (ev: unknown) => void) => void;
      setPosition: (pos: unknown) => void;
    };
    Geocoder: new () => {
      geocode: (req: unknown, cb: (results: unknown, status: string) => void) => void;
    };
    LatLng: new (lat: number, lng: number) => unknown;
    event: {
      trigger: (instance: unknown, eventName: string) => void;
    };
    places: {
      Autocomplete: new (
        input: HTMLInputElement,
        opts: unknown,
      ) => {
        addListener: (eventName: string, handler: () => void) => void;
        getPlace: () => unknown;
      };
    };
  };
};

function getGoogle(): GoogleMapsApi | null {
  const g = window.google;
  if (!g) return null;
  return g as unknown as GoogleMapsApi;
}

declare global {
  interface Window {
    google?: unknown;
  }
}

const DELIVERY_KEY = "checkout_delivery_type";

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const e = error as HttpErrorLike;
  if (typeof e.message === "string" && e.message.trim()) return e.message;
  if (e.details && typeof e.details === "object") {
    const d = e.details as { message?: unknown; error?: unknown };
    if (typeof d.message === "string" && d.message.trim()) return d.message;
    if (typeof d.error === "string" && d.error.trim()) return d.error;
  }
  return fallback;
}

export function CheckoutPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [params] = useSearchParams();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [alert, setAlert] = useState<{ variant: "success" | "warning" | "danger"; text: string } | null>(null);
  const [successOrderId, setSuccessOrderId] = useState<string>("");

  const [receiptType, setReceiptType] = useState<"BOLETA" | "FACTURA">("BOLETA");
  const [razonSocial, setRazonSocial] = useState<string>("");
  const [ruc, setRuc] = useState<string>("");
  const [dirFiscal, setDirFiscal] = useState<string>("");

  const [deliveryType, setDeliveryType] = useState<"DOMICILIO" | "RECOJO">(() => {
    const v = localStorage.getItem(DELIVERY_KEY);
    return v === "RECOJO" || v === "DOMICILIO" ? v : "DOMICILIO";
  });
  const [direccion, setDireccion] = useState<string>("");
  const [showMap, setShowMap] = useState<boolean>(false);
  const [isPaying, setIsPaying] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const mapStateRef = useRef<{
    map?: unknown;
    marker?: { addListener: (e: string, h: (ev: unknown) => void) => void; setPosition: (p: unknown) => void };
    geocoder?: { geocode: (req: unknown, cb: (results: unknown, status: string) => void) => void };
    autocomplete?: { addListener: (e: string, h: () => void) => void; getPlace: () => unknown };
  }>({});
  const mapsLoadingRef = useRef<Promise<void> | null>(null);

  async function reverseGeocodeFromCoords(lat: number, lng: number): Promise<{ address: string | null; status: string }> {
    const state = mapStateRef.current;
    if (!state?.geocoder) return { address: null, status: "NO_GEOCODER" };

    return new Promise(resolve => {
      state.geocoder?.geocode({ location: { lat, lng } }, (results, status: string) => {
        if (status === "OK" && Array.isArray(results) && results.length > 0) {
          const first = results[0] as { formatted_address?: unknown };
          if (typeof first.formatted_address === "string" && first.formatted_address.trim()) {
            resolve({ address: first.formatted_address, status });
            return;
          }
        }
        resolve({ address: null, status });
      });
    });
  }

  const { data: deliveryCfg } = useQuery({
    queryKey: ["config", "delivery"],
    queryFn: () => api.get<DeliveryConfig>("/config/delivery"),
  });

  const { data: items, isLoading: cartLoading } = useQuery({
    queryKey: ["cart", "items"],
    queryFn: () => loadCart(),
  });

  const cartItems = useMemo(() => items ?? [], [items]);
  const isCartEmpty = !cartLoading && cartItems.length === 0;

  const subtotal = useMemo(() => cartItems.reduce((s, it) => s + Number(it.product.price ?? 0) * Number(it.quantity ?? 0), 0), [cartItems]);
  const shipping = useMemo(() => {
    if (deliveryType !== "DOMICILIO") return 0;
    return Number(deliveryCfg?.pricing?.base ?? 5);
  }, [deliveryType, deliveryCfg?.pricing?.base]);
  const total = useMemo(() => subtotal + shipping, [subtotal, shipping]);

  useEffect(() => {
    localStorage.setItem(DELIVERY_KEY, deliveryType);
  }, [deliveryType]);

  useEffect(() => {
    if (deliveryType !== "DOMICILIO") setShowMap(false);
  }, [deliveryType]);

  useEffect(() => {
    // El mapa solo existe en el Paso Entrega.
    // Si conservamos la instancia al cambiar de paso/tipo de entrega u ocultar el mapa,
    // queda ligada a un contenedor viejo y al volver ya no se renderiza. Reseteamos para forzar re-init.
    if (step !== 0 || deliveryType !== "DOMICILIO" || !showMap) {
      mapStateRef.current = {};
    }
  }, [deliveryType, showMap, step]);

  // Manejo post-pago legado (?ok=1&order=...)
  useEffect(() => {
    const ok = params.get("ok");
    const order = params.get("order") || "";
    if (ok === "1") {
      setSuccessOrderId(order);
      setStep(3);
      setAlert({ variant: "success", text: `¡Pago exitoso! Pedido #${order} confirmado.` });
      (async () => {
        try {
          await clearCart();
        } catch {
          // ignore
        } finally {
          await qc.invalidateQueries({ queryKey: ["cart", "items"] });
          await qc.invalidateQueries({ queryKey: ["cart", "count"] });
          nav("/checkout", { replace: true });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // El mapa solo existe en el Paso Entrega (step === 0). Si lo inicializamos antes,
    // `mapDivRef.current` aún es null y nunca llega a dibujarse hasta que el usuario
    // cambie de opción (bug reportado).
    if (step !== 0) return;
    if (deliveryType !== "DOMICILIO") return;
    if (!showMap) return;
    void initDeliveryMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, deliveryType, showMap, deliveryCfg?.store?.lat, deliveryCfg?.store?.lng]);

  async function loadGoogleMaps(): Promise<void> {
    if (getGoogle()?.maps?.places) return;
    if (mapsLoadingRef.current) return mapsLoadingRef.current;

    mapsLoadingRef.current = (async () => {
      const scripts = Array.from(document.scripts);
      const existing = scripts.find(s => (s as HTMLScriptElement).src?.includes("maps.googleapis.com/maps/api/js")) as HTMLScriptElement | undefined;

      if (existing) {
        await new Promise<void>((resolve, reject) => {
          existing.addEventListener("load", () => (getGoogle()?.maps ? resolve() : reject(new Error("google.maps no disponible"))), { once: true });
          existing.addEventListener("error", () => reject(new Error("Error cargando Google Maps")), { once: true });
        });
        return;
      }

      const data = await api.get<{ key: string }>("/config/maps-key");
      const key = data?.key || "";
      if (!key) throw new Error("Google Maps API key no configurada");

      await new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://maps.googleapis.com/maps/api/js" + `?key=${encodeURIComponent(key)}` + "&libraries=places" + "&language=es" + "&region=PE";
        s.async = true;
        s.defer = true;
        s.crossOrigin = "anonymous";
        s.onload = () => (getGoogle()?.maps ? resolve() : reject(new Error("google.maps no disponible")));
        s.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
        document.head.appendChild(s);
      });
    })();

    try {
      await mapsLoadingRef.current;
    } catch (e) {
      mapsLoadingRef.current = null;
      throw e;
    }
  }

  async function initDeliveryMap() {
    if (!mapDivRef.current || !addressInputRef.current) return;
    if (!deliveryCfg?.store) return;

    try {
      await loadGoogleMaps();
    } catch {
      return;
    }

    const g = getGoogle();
    if (!g?.maps?.places) return;

    const center = { lat: deliveryCfg.store.lat, lng: deliveryCfg.store.lng };
    const state = mapStateRef.current || (mapStateRef.current = {});

    if (!state.map) {
      state.map = new g.maps.Map(mapDivRef.current, { center, zoom: 13 });
      state.marker = new g.maps.Marker({ map: state.map, position: center, draggable: true });
      state.geocoder = new g.maps.Geocoder();
      state.autocomplete = new g.maps.places.Autocomplete(addressInputRef.current, {
        fields: ["formatted_address", "geometry"],
        componentRestrictions: { country: ["pe"] },
      });

      const ac = state.autocomplete;
      ac.addListener("place_changed", () => {
        const place = ac.getPlace();
        if (!place || typeof place !== "object") return;
        const maybe = place as { geometry?: { location?: unknown }; formatted_address?: unknown };
        const loc = maybe.geometry?.location;
        if (!loc) return;
        // Map/Marker APIs accept opaque location objects from google.
        (state.map as { setCenter: (l: unknown) => void }).setCenter(loc);
        state.marker?.setPosition(loc);
        const formatted = typeof maybe.formatted_address === "string" ? maybe.formatted_address : "";
        setDireccion(formatted || addressInputRef.current?.value || "");
      });

      state.marker.addListener("dragend", ev => {
        const drag = ev as { latLng?: { lat: () => number; lng: () => number } };
        if (!state.geocoder || !drag.latLng) return;

        const lat = drag.latLng.lat();
        const lng = drag.latLng.lng();

        void (async () => {
          const geocoded = await reverseGeocodeFromCoords(lat, lng);
          if (geocoded.address) {
            setDireccion(geocoded.address);
            return;
          }

          setDireccion(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);

          if (geocoded.status === "REQUEST_DENIED") {
            setAlert({
              variant: "warning",
              text: "Google rechazó la geocodificación del pin. Habilita Geocoding API y valida restricciones HTTP referrer en Google Cloud.",
            });
          }
        })();
      });
    } else {
      (state.map as { setCenter: (c: { lat: number; lng: number }) => void }).setCenter(center);
      g.maps.event.trigger(state.map, "resize");
    }
  }

  function validateDeliveryStep(): boolean {
    if (deliveryType === "DOMICILIO") {
      if (!direccion.trim()) {
        setAlert({ variant: "warning", text: "Ingresa tu dirección para el envío a domicilio." });
        return false;
      }
    }
    return true;
  }

  function validateReceiptStep(): boolean {
    // Checkout realista: la boleta no requiere DNI/nombre para pagar.
    // Solo validamos datos si el usuario solicita FACTURA.
    if (receiptType === "FACTURA" && (!ruc.trim() || !razonSocial.trim())) {
      setAlert({ variant: "warning", text: "RUC y Razón social son obligatorios para la factura." });
      return false;
    }
    return true;
  }

  async function onPay() {
    setAlert(null);

    if (!isAuthenticated) {
      setAlert({ variant: "warning", text: "Debes iniciar sesión para finalizar tu compra." });
      return;
    }
    if (isCartEmpty) {
      setAlert({ variant: "warning", text: "Tu carrito está vacío." });
      return;
    }

    setIsPaying(true);
    try {
      const receiptData = receiptType === "FACTURA" ? { razon_social: razonSocial.trim(), ruc: ruc.trim(), direccion: dirFiscal.trim() } : {};

      // En Mercado Pago (Checkout Pro) el medio de pago real se elige allá.
      // Mantenemos un ID por compatibilidad con el backend.
      const paymentMethodId = 4;
      const address =
        deliveryType === "DOMICILIO" ? direccion.trim() : `${deliveryCfg?.store?.name || "Almacén Central"} – ${deliveryCfg?.store?.address || ""}`;

      const order = await api.post<DraftOrderResponse>("/orders", {
        deliveryType,
        address,
        shippingCost: deliveryType === "DOMICILIO" ? shipping : 0,
        receiptType,
        receiptData,
        paymentMethodId,
      });

      // Mercado Pago real (Checkout Pro)
      const init = await api.post<IzipayInitResponse>("/payment/mercadopago/init", {
        orderId: order.orderId,
        receiptType,
        receiptData,
      });

      if (init.mode === "redirect") {
        const redirectUrl = (init as { redirectUrl?: unknown }).redirectUrl;
        if (typeof redirectUrl === "string" && redirectUrl) {
          window.location.href = redirectUrl;
          return;
        }
        setAlert({ variant: "danger", text: "Mercado Pago no devolvió una URL válida para continuar el pago." });
        return;
      }

      if (init.mode === "mock") {
        setAlert({
          variant: "danger",
          text: "El backend está en modo mock/sandbox. Configura Mercado Pago en modo producción para cobrar con tarjeta real.",
        });
        return;
      }

      setAlert({ variant: "warning", text: "No se pudo iniciar el pago con Mercado Pago." });
    } catch (error) {
      setAlert({ variant: "danger", text: resolveErrorMessage(error, "No se pudo procesar tu pago.") });
    } finally {
      setIsPaying(false);
    }
  }

  const shippingLabel = deliveryType === "DOMICILIO" ? "a domicilio" : "en tienda";

  return (
    <main className="container my-4">
      <h1 className="mb-4">Resumen de Compra</h1>

      {alert ? <div className={`alert alert-${alert.variant}`}>{alert.text}</div> : null}

      {!isAuthenticated && step !== 3 ? (
        <div className="alert alert-warning">
          Debes <Link to="?login=1">iniciar sesión</Link> para finalizar la compra.
        </div>
      ) : null}

      <div className="row g-4">
        <div className="col-lg-8">
          {/* Paso 1: Entrega */}
          {step === 0 ? (
            <section>
              <div className="card shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">Entrega</h5>

                  <div className="mb-3">
                    <label className="me-3">
                      <input
                        type="radio"
                        name="envio"
                        value="DOMICILIO"
                        checked={deliveryType === "DOMICILIO"}
                        onChange={() => setDeliveryType("DOMICILIO")}
                      />{" "}
                      Envío a domicilio
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="envio"
                        value="RECOJO"
                        checked={deliveryType === "RECOJO"}
                        onChange={() => setDeliveryType("RECOJO")}
                      />{" "}
                      Recojo en tienda
                    </label>

                    <div className="text-muted mt-2">
                      {deliveryType === "DOMICILIO" ? "Entrega estimada: 30–60 min (según zona)." : "Listo para recojo: 15–30 min (según demanda)."}
                    </div>
                  </div>

                  {deliveryType === "DOMICILIO" ? (
                    <div className="row g-3 envio-fields">
                      <div className="col-md-9">
                        <label className="form-label">Dirección de entrega</label>
                        <input
                          ref={addressInputRef}
                          id="direccion"
                          className="form-control"
                          placeholder="Escribe tu dirección"
                          value={direccion}
                          onChange={e => setDireccion(e.target.value)}
                        />
                        <small className="text-muted d-block mt-1">Puedes seleccionar una sugerencia. El mapa es opcional.</small>
                      </div>

                      <div className="col-12">
                        <div className="form-check mb-2">
                          <input
                            id="toggle-map"
                            className="form-check-input"
                            type="checkbox"
                            checked={showMap}
                            onChange={e => setShowMap(e.target.checked)}
                          />
                          <label className="form-check-label" htmlFor="toggle-map">
                            Mostrar mapa (opcional)
                          </label>
                        </div>

                        {showMap ? (
                          <>
                            <div className="d-flex justify-content-end mb-2">
                              <button
                                id="btnGeolocate"
                                type="button"
                                className="btn btn-outline-primary btn-sm"
                                onClick={() => {
                                  try {
                                    if (!navigator.geolocation) return;
                                    navigator.geolocation.getCurrentPosition(
                                      pos => {
                                        const { latitude, longitude } = pos.coords;
                                        const g = getGoogle();
                                        if (!g) return;
                                        const state = mapStateRef.current;
                                        if (!state?.map || !state.marker) return;
                                        const latLng = new g.maps.LatLng(latitude, longitude);
                                        (state.map as { setCenter: (l: unknown) => void }).setCenter(latLng);
                                        state.marker.setPosition(latLng);

                                        void (async () => {
                                          const geocoded = await reverseGeocodeFromCoords(latitude, longitude);
                                          if (geocoded.address) {
                                            setDireccion(geocoded.address);
                                          } else {
                                            setDireccion(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
                                          }
                                        })();
                                      },
                                      () => {
                                        setAlert({ variant: "warning", text: "No se pudo obtener tu ubicación." });
                                      },
                                      { enableHighAccuracy: true, timeout: 10000 },
                                    );
                                  } catch {
                                    // ignore
                                  }
                                }}
                              >
                                <i className="fa-solid fa-location-crosshairs me-1"></i> Usar mi ubicación
                              </button>
                            </div>
                            <div ref={mapDivRef} id="map" style={{ height: 280 }} className="rounded border"></div>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div id="pickup-wrap" className="pickup-fields">
                      <div className="pickup-card">
                        <div className="icon">
                          <i className="fa-solid fa-store"></i>
                        </div>
                        <div className="body">
                          <div className="title" id="pickup-name">
                            {deliveryCfg?.store?.name || "Almacén Central"}
                          </div>
                          <div className="row">
                            <div className="col-sm-7">
                              <div className="item">
                                <i className="fa-solid fa-location-dot"></i>
                                <span id="pickup-address">{deliveryCfg?.store?.address || "Av. Principal 123, Lima"}</span>
                              </div>
                              <div className="item">
                                <i className="fa-solid fa-phone"></i>
                                <span id="pickup-phone">{deliveryCfg?.store?.phone || "(01) 123-4567"}</span>
                              </div>
                            </div>
                            <div className="col-sm-5">
                              <div className="item">
                                <i className="fa-regular fa-clock"></i>
                                <span id="pickup-hours">{deliveryCfg?.store?.hours || "Lun-Dom 9:00-9:00"}</span>
                              </div>
                            </div>
                          </div>
                          <small className="text-muted">Lleva tu DNI y el número de pedido.</small>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 d-flex justify-content-between">
                    <Link to="/cart" className="btn btn-outline-secondary">
                      Volver al carrito
                    </Link>
                    <button
                      className="btn btn-primary-custom"
                      type="button"
                      onClick={() => {
                        setAlert(null);
                        if (!validateDeliveryStep()) return;
                        setStep(1);
                      }}
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Paso 2: Comprobante */}
          {step === 1 ? (
            <section>
              <div className="card shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">Comprobante</h5>

                  <div className="row g-3 mt-1">
                    <div className="col-md-6">
                      <label className="form-label">Tipo de comprobante</label>
                      <br />
                      <label className="me-3">
                        <input type="radio" name="comp" value="BOLETA" checked={receiptType === "BOLETA"} onChange={() => setReceiptType("BOLETA")} />{" "}
                        Boleta
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="comp"
                          value="FACTURA"
                          checked={receiptType === "FACTURA"}
                          onChange={() => setReceiptType("FACTURA")}
                        />{" "}
                        Factura
                      </label>
                    </div>
                  </div>

                  {receiptType === "BOLETA" ? (
                    <div className="mt-2 text-muted">Boleta (recomendado). No necesitas ingresar datos adicionales para continuar.</div>
                  ) : (
                    <div className="row g-3 mt-1 factura-fields">
                      <div className="col-md-6">
                        <label className="form-label">Razón Social</label>
                        <input
                          id="razon_social"
                          className="form-control"
                          placeholder="Mi Empresa SAC"
                          value={razonSocial}
                          onChange={e => setRazonSocial(e.target.value)}
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">RUC</label>
                        <input id="ruc" className="form-control" placeholder="20123456789" value={ruc} onChange={e => setRuc(e.target.value)} />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label">Dirección fiscal</label>
                        <input
                          id="dir_fiscal"
                          className="form-control"
                          placeholder="Av. Principal 123"
                          value={dirFiscal}
                          onChange={e => setDirFiscal(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-3 d-flex justify-content-between">
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setStep(0)}>
                      Atrás
                    </button>
                    <button
                      className="btn btn-primary-custom"
                      type="button"
                      onClick={() => {
                        setAlert(null);
                        if (!validateReceiptStep()) return;
                        setStep(2);
                      }}
                    >
                      Continuar
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Paso 3 */}
          {step === 2 ? (
            <section>
              <div className="card shadow-sm">
                <div className="card-body">
                  <h5 className="card-title">Pago</h5>
                  <div className="text-muted">Serás redirigido a Mercado Pago para completar el pago de forma segura.</div>

                  <div className="mt-3 d-flex justify-content-between">
                    <button className="btn btn-outline-secondary" type="button" onClick={() => setStep(1)}>
                      Atrás
                    </button>
                    <button className="btn btn-success" type="button" onClick={() => void onPay()} disabled={isPaying || isCartEmpty}>
                      {isPaying ? "Procesando..." : "Pagar"}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {/* Paso éxito */}
          {step === 3 ? (
            <section id="step-success">
              <div className="card shadow-sm">
                <div className="card-body text-center">
                  <div className="display-6 mb-2">¡Gracias por tu compra!</div>
                  <p className="lead">
                    Tu pedido{" "}
                    <strong>
                      #<span id="success-order-id">{successOrderId}</span>
                    </strong>{" "}
                    fue confirmado.
                  </p>
                  <div className="mt-3 d-flex gap-2 justify-content-center">
                    <Link to="/products" className="btn btn-primary-custom">
                      Seguir comprando
                    </Link>
                    <Link to="/dashboard/customer" className="btn btn-outline-secondary">
                      Ver mis pedidos
                    </Link>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="col-lg-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <h5 className="card-title">Resumen</h5>
              <div id="checkout-cart-items">
                {cartItems.map(it => (
                  <div key={it.product.id} className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <div className="fw-semibold">{it.product.name}</div>
                      <small className="text-muted">x{it.quantity}</small>
                    </div>
                    <div className="fw-semibold">S/ {(Number(it.product.price ?? 0) * Number(it.quantity ?? 0)).toFixed(2)}</div>
                  </div>
                ))}
              </div>

              <div id="shipping-summary" className="summary-row mt-2" aria-live="polite">
                <div className="d-flex align-items-center gap-2">
                  <i className="fa-solid fa-truck-fast text-secondary"></i>
                  <span className="text-secondary">Envío</span>
                  <span id="shipping-label" className="badge bg-light text-secondary border">
                    {shippingLabel}
                  </span>
                </div>
                <strong id="shipping-amount">S/ {shipping.toFixed(2)}</strong>
              </div>

              <div className="d-flex justify-content-between align-items-center mt-2">
                <strong>Total a Pagar</strong>
                <span id="total-pagar" className="fw-bold">
                  S/ {total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
