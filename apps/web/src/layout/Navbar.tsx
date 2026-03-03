import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent as FormEventType } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/useAuth";
import { api } from "../api/http";
import { getCartCount } from "../cart/cartService";
import { normalizeImageUrl, PLACEHOLDER_PRODUCT } from "../shared/image";
import { LoginModal } from "./LoginModal";

type SearchProduct = {
  id: number;
  nombre: string;
  precio?: number;
  imagen?: string | null;
};

type Category = {
  id: number;
  name: string;
};

type MenuProduct = {
  id: number;
  nombre: string;
};

function splitByQuery(text: string, query: string): Array<{ text: string; match: boolean }> {
  const t = (text || "").toString();
  const q = (query || "").toString().trim();
  if (!t || !q) return [{ text: t, match: false }];

  const lowerText = t.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx < 0) return [{ text: t, match: false }];

  const before = t.slice(0, idx);
  const mid = t.slice(idx, idx + q.length);
  const after = t.slice(idx + q.length);

  const parts: Array<{ text: string; match: boolean }> = [];
  if (before) parts.push({ text: before, match: false });
  if (mid) parts.push({ text: mid, match: true });
  if (after) parts.push({ text: after, match: false });
  return parts;
}

function getInitials(name?: string, lastName?: string): string {
  const a = (name || "").trim();
  const b = (lastName || "").trim();
  const ch1 = a ? a[0] : "U";
  const ch2 = b ? b[0] : "";
  return (ch1 + ch2).toUpperCase();
}

function dashboardPath(rol: string | undefined): string {
  const r = (rol || "").trim().toUpperCase();
  if (r === "ADMIN" || r === "ADMINISTRADOR") return "/dashboard/admin";
  if (r === "EMPLEADO" || r === "EMPLOYEE") return "/dashboard/employee";
  if (r === "CLIENTE" || r === "CUSTOMER") return "/dashboard/customer";
  return "/dashboard/customer";
}

export function Navbar() {
  const nav = useNavigate();
  const { pathname, search: locationSearch } = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);

  const searchWrapRef = useRef<HTMLDivElement | null>(null);
  const [allProducts, setAllProducts] = useState<SearchProduct[]>([]);
  const [suggestions, setSuggestions] = useState<SearchProduct[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);

  const [menuCategoryId, setMenuCategoryId] = useState<number | null>(null);
  const [menuAllHover, setMenuAllHover] = useState(false);

  const p = pathname.toLowerCase();
  const isStaffDashboard = p.startsWith("/dashboard/admin") || p.startsWith("/dashboard/employee");

  const { data: cartCount } = useQuery({
    queryKey: ["cart", "count"],
    queryFn: () => getCartCount(),
    retry: false,
  });

  const count = useMemo(() => Number(cartCount ?? 0), [cartCount]);

  const { data: categories } = useQuery({
    queryKey: ["products", "categories"],
    queryFn: () => api.get<Category[]>("/products/categories"),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (menuCategoryId != null) return;
    if (!Array.isArray(categories) || categories.length === 0) return;
    setMenuCategoryId(categories[0].id);
  }, [categories, menuCategoryId]);

  const selectedCategory = useMemo(() => {
    if (!Array.isArray(categories) || categories.length === 0) return null;
    if (menuCategoryId == null) return categories[0];
    return categories.find(c => c.id === menuCategoryId) || categories[0];
  }, [categories, menuCategoryId]);

  const { data: categoryProducts, isLoading: categoryProductsLoading } = useQuery({
    queryKey: ["products", "byCategory", selectedCategory?.id ?? null],
    enabled: Boolean(selectedCategory?.id),
    queryFn: () => api.get<MenuProduct[]>(`/products?category=${encodeURIComponent(String(selectedCategory!.id))}&limit=24&page=1`),
    staleTime: 2 * 60 * 1000,
  });

  useEffect(() => {
    const params = new URLSearchParams(locationSearch || "");
    const login = params.get("login");
    if (!login) return;
    const normalized = login.trim().toLowerCase();
    if (normalized !== "1" && normalized !== "true") return;

    const timerId = window.setTimeout(() => setLoginOpen(true), 0);

    params.delete("login");
    const nextSearch = params.toString();
    nav({ pathname, search: nextSearch ? `?${nextSearch}` : "" }, { replace: true });

    return () => window.clearTimeout(timerId);
  }, [locationSearch, nav, pathname]);

  if (isStaffDashboard) return null;

  // Si el usuario cambia de rol en storage, este navbar se re-renderiza porque viene del contexto.
  const avatar = getInitials(user?.nombre, user?.apellido);

  const onSearchSubmit = (e: FormEventType) => {
    e.preventDefault();
    const q = search.trim();
    // Mantiene el look del buscador legacy, pero por ahora redirige al catálogo.
    // (Luego podemos implementar filtros reales sin romper el diseño.)
    setSuggestOpen(false);
    if (q) nav(`/products?search=${encodeURIComponent(q)}`);
    else nav("/products");
  };

  useEffect(() => {
    const onDocMouseDown = (ev: MouseEvent) => {
      const root = searchWrapRef.current;
      if (!root) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setSuggestLoading(true);

        let source = allProducts;
        if (source.length === 0) {
          const list = await api.get<SearchProduct[]>("/products");
          source = Array.isArray(list) ? list : [];
          setAllProducts(source);
        }

        const next = source.filter(p => (p?.nombre || "").toLowerCase().includes(q)).slice(0, 6);

        setSuggestions(next);
        setSuggestOpen(true);
      } catch {
        setSuggestions([]);
        setSuggestOpen(false);
      } finally {
        setSuggestLoading(false);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [allProducts, search]);

  const onLogout = () => {
    logout();
    nav("/", { replace: true });
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark sticky-top mmx-navbar">
        <div className="container-fluid">
          <div className="d-flex align-items-center gap-3 mmx-navbar-left">
            <Link className="navbar-brand d-flex align-items-center mb-0 mmx-navbar-brand" to="/">
              <img src="/assets/images/logo-bodega.png" alt="Logo Minimarket Express" className="img-fluid" style={{ maxWidth: 42 }} />
              <span className="fw-bold ms-2 mmx-brand-text">Minimarket Express</span>
            </Link>

            <button
              type="button"
              className="btn btn-link text-white text-decoration-none d-flex align-items-center gap-2 p-0 mmx-menu-trigger"
              data-bs-toggle="offcanvas"
              data-bs-target="#mainMenu"
              aria-controls="mainMenu"
            >
              <i className="fas fa-bars"></i>
              <span>Menú</span>
            </button>
          </div>

          <div className="flex-grow-1 px-3 mmx-search-col" style={{ maxWidth: 780 }}>
            <div ref={searchWrapRef} className="position-relative">
              <form className="search-box mmx-search-box" id="search-form" role="search" onSubmit={onSearchSubmit} autoComplete="off">
                <input
                  className="form-control mmx-search-input"
                  type="search"
                  placeholder="Buscar productos..."
                  aria-label="Buscar"
                  id="search-input"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={() => {
                    const q = search.trim();
                    if (q.length >= 2 && (suggestions.length > 0 || suggestLoading)) setSuggestOpen(true);
                  }}
                />
                <button className="btn mmx-search-btn" type="submit" aria-label="Buscar">
                  <i className="fas fa-search"></i>
                </button>
              </form>

              {suggestOpen ? (
                <div
                  className="position-absolute start-0 top-100 mt-1 bg-white border rounded shadow-sm"
                  style={{ width: "100%", zIndex: 1050, maxHeight: 320, overflowY: "auto" }}
                  role="listbox"
                  aria-label="Sugerencias de productos"
                >
                  {suggestLoading ? (
                    <div className="px-3 py-2 text-muted">Cargando...</div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3 py-2 text-muted">Sin resultados</div>
                  ) : (
                    <div className="list-group list-group-flush">
                      {suggestions.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className="list-group-item list-group-item-action d-flex align-items-center gap-2"
                          onClick={() => {
                            setSuggestOpen(false);
                            setSearch("");
                            nav(`/products/${p.id}`);
                          }}
                        >
                          <img
                            src={normalizeImageUrl(p.imagen)}
                            alt={p.nombre}
                            className="rounded border flex-shrink-0"
                            style={{ width: 40, height: 40, objectFit: "contain" }}
                            onError={e => {
                              (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_PRODUCT;
                            }}
                          />
                          <div className="flex-grow-1" style={{ minWidth: 0 }}>
                            <div className="text-truncate">
                              {splitByQuery(p.nombre || "", search.trim()).map((part, idx) =>
                                part.match ? <strong key={idx}>{part.text}</strong> : <span key={idx}>{part.text}</span>,
                              )}
                            </div>
                          </div>
                          {typeof p.precio === "number" ? (
                            <div className="ms-auto text-muted text-nowrap">S/ {Number(p.precio).toFixed(2)}</div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          <div className="d-flex align-items-center gap-3 me-2 mmx-navbar-right">
            {!isAuthenticated ? (
              <div className="dropdown">
                <button
                  type="button"
                  className="btn btn-link text-white text-decoration-none p-0 dropdown-toggle mmx-account-trigger"
                  id="guestMenu"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  <div className="d-flex align-items-center gap-2 mmx-account-summary">
                    <span
                      className="rounded-circle bg-light text-dark fw-bold d-inline-flex justify-content-center align-items-center mmx-avatar"
                      style={{ width: 30, height: 30, fontSize: "0.95rem" }}
                      aria-label="avatar"
                    >
                      <i className="fa-solid fa-user" aria-hidden="true"></i>
                    </span>
                    <div className="d-flex flex-column align-items-start mmx-account-text" style={{ lineHeight: 1.1 }}>
                      <span className="mmx-account-hello" style={{ fontSize: "0.9rem" }}>
                        Hola,
                      </span>
                      <strong className="mmx-account-name" style={{ fontSize: "0.95rem" }}>
                        Inicia sesión
                      </strong>
                    </div>
                  </div>
                </button>
                <ul className="dropdown-menu dropdown-menu-end account-dropdown-menu" aria-labelledby="guestMenu">
                  <li>
                    <button
                      className="dropdown-item account-dropdown-item d-flex align-items-center gap-2"
                      type="button"
                      onClick={() => setLoginOpen(true)}
                    >
                      <i className="fa-solid fa-right-to-bracket" aria-hidden="true"></i>
                      <span>Iniciar sesión</span>
                    </button>
                  </li>
                  <li>
                    <NavLink className="dropdown-item account-dropdown-item d-flex align-items-center gap-2" to="/register">
                      <i className="fa-solid fa-user-plus" aria-hidden="true"></i>
                      <span>Regístrate</span>
                    </NavLink>
                  </li>
                  <li>
                    <hr className="dropdown-divider account-dropdown-divider" />
                  </li>
                  <li>
                    <a
                      className="dropdown-item account-dropdown-item d-flex align-items-center gap-2"
                      href="https://backoffice.minimarketexpress.shop/backoffice/login"
                    >
                      <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
                      <span className="d-flex align-items-center gap-2">
                        Portal interno
                        <span className="badge text-bg-light border text-secondary fw-semibold">Staff</span>
                      </span>
                    </a>
                  </li>
                </ul>
              </div>
            ) : (
              <div className="dropdown" id="user-menu">
                <button
                  type="button"
                  className="btn btn-link text-white text-decoration-none p-0 dropdown-toggle mmx-account-trigger"
                  id="userDropdown"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  <div className="d-flex align-items-center gap-2 mmx-account-summary">
                    <span
                      className="rounded-circle bg-light text-dark fw-bold d-inline-flex justify-content-center align-items-center mmx-avatar"
                      style={{ width: 30, height: 30, fontSize: "0.95rem" }}
                      aria-label="avatar"
                    >
                      {avatar}
                    </span>
                    <div className="d-flex flex-column align-items-start mmx-account-text" style={{ lineHeight: 1.1 }}>
                      <span className="mmx-account-hello" style={{ fontSize: "0.9rem" }}>
                        Hola,
                      </span>
                      <strong className="mmx-account-name" style={{ fontSize: "0.95rem" }}>
                        {user?.nombre || "Usuario"}
                      </strong>
                    </div>
                  </div>
                </button>

                <ul className="dropdown-menu dropdown-menu-end account-dropdown-menu" aria-labelledby="userDropdown">
                  <li>
                    <button
                      className="dropdown-item account-dropdown-item d-flex align-items-center gap-2"
                      type="button"
                      onClick={() => nav(dashboardPath(user?.rol?.toString()))}
                    >
                      <i className="fa-solid fa-user" aria-hidden="true"></i>
                      <span>Mi cuenta</span>
                    </button>
                  </li>
                  <li>
                    <button
                      className="dropdown-item account-dropdown-item text-danger d-flex align-items-center gap-2"
                      type="button"
                      onClick={onLogout}
                    >
                      <i className="fa-solid fa-right-from-bracket" aria-hidden="true"></i>
                      <span>Cerrar sesión</span>
                    </button>
                  </li>
                </ul>
              </div>
            )}

            <NavLink className="nav-link position-relative text-white mmx-cart-link" to="/cart" aria-label="Carrito">
              <i className="fas fa-shopping-cart"></i>
              <span className="badge rounded-pill position-absolute mmx-cart-badge" style={{ top: -6, right: -10, fontSize: "0.7rem" }}>
                {count}
              </span>
            </NavLink>
          </div>
        </div>
      </nav>

      <div className="offcanvas offcanvas-start" tabIndex={-1} id="mainMenu" aria-labelledby="mainMenuLabel" style={{ width: 800, maxWidth: "92vw" }}>
        <div className="offcanvas-header">
          <h5 className="offcanvas-title" id="mainMenuLabel">
            Menú
          </h5>
          <button type="button" className="btn-close" data-bs-dismiss="offcanvas" aria-label="Cerrar"></button>
        </div>
        <div className="offcanvas-body">
          <div className="row g-0" style={{ height: "100%" }}>
            <div className="col-6 border-end" style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
              <div className="list-group list-group-flush">
                {(Array.isArray(categories) ? categories : []).map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center ${
                      !menuAllHover && (selectedCategory?.id ?? null) === c.id ? "active" : ""
                    }`}
                    onMouseEnter={() => {
                      setMenuAllHover(false);
                      setMenuCategoryId(c.id);
                    }}
                    onFocus={() => {
                      setMenuAllHover(false);
                      setMenuCategoryId(c.id);
                    }}
                    onClick={() => {
                      setMenuAllHover(false);
                      setMenuCategoryId(c.id);
                    }}
                  >
                    <span className="text-truncate">{c.name}</span>
                    <i className="fas fa-chevron-right" aria-hidden="true"></i>
                  </button>
                ))}
                {Array.isArray(categories) && categories.length === 0 ? <div className="px-3 py-2 text-muted">Sin categorías</div> : null}
                {!Array.isArray(categories) ? <div className="px-3 py-2 text-muted">Cargando...</div> : null}

                <button
                  type="button"
                  className={`list-group-item list-group-item-action fw-semibold d-flex justify-content-between align-items-center ${
                    menuAllHover ? "active" : ""
                  }`}
                  data-bs-dismiss="offcanvas"
                  onMouseEnter={() => setMenuAllHover(true)}
                  onMouseLeave={() => setMenuAllHover(false)}
                  onFocus={() => setMenuAllHover(true)}
                  onBlur={() => setMenuAllHover(false)}
                  onClick={() => nav("/products?limit=100&page=1")}
                >
                  <span>Ver todo</span>
                </button>
              </div>
            </div>

            <div className="col-6 p-3" style={{ maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <div className="fw-semibold">{selectedCategory?.name || ""}</div>
                {selectedCategory ? (
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    data-bs-dismiss="offcanvas"
                    onClick={() => nav(`/products?category=${encodeURIComponent(String(selectedCategory.id))}&limit=100&page=1`)}
                  >
                    Ver todo
                  </button>
                ) : null}
              </div>

              {selectedCategory ? (
                categoryProductsLoading ? (
                  <div className="text-muted">Cargando...</div>
                ) : (Array.isArray(categoryProducts) ? categoryProducts : []).length === 0 ? (
                  <div className="text-muted">Sin productos en esta categoría.</div>
                ) : (
                  <div className="d-flex flex-column gap-2">
                    {(Array.isArray(categoryProducts) ? categoryProducts : []).map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className="btn btn-link p-0 text-start text-decoration-none text-reset w-100"
                        data-bs-dismiss="offcanvas"
                        onClick={() => nav(`/products/${p.id}`)}
                      >
                        <div className="small text-truncate">{p.nombre}</div>
                      </button>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={u => {
          // Si el usuario inicia sesión desde /checkout, mantenlo en la misma sección.
          if (pathname.toLowerCase().startsWith("/checkout")) return;
          nav(dashboardPath(String(u.rol ?? "")), { replace: true });
        }}
      />
    </>
  );
}
