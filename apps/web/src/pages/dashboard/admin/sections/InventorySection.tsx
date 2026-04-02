import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import {
  fetchInventoryKpis,
  fetchInventoryCategories,
  fetchInventoryPaginated,
  fetchInbound,
  createInbound,
} from "../../shared/services/inventoryService";
import { getErrorMessage } from "../../shared/utils/errors";
import { money, getInventorySelectionLabel } from "../../shared/utils/format";
import type { InventoryKpis, InventoryPaginatedResponse, InboundResponse } from "../../shared/types/inventory.types";
import type { ProductCatalogOption } from "../../shared/types/products.types";
import type { JumpIntent } from "../AdminShell";

interface Props {
  jumpIntent: JumpIntent | null;
  onConsumeJump: () => void;
  exportFile: (path: string, fallbackFilename: string) => Promise<void>;
  exportingGeneric: boolean;
  genericExportError: string | null;
}

export function InventorySection({ jumpIntent, onConsumeJump, exportFile, exportingGeneric, genericExportError }: Props) {
  const qc = useQueryClient();

  const [invDraft, setInvDraft] = useState<{ search: string; categoriaId: string; pageSize: string }>({
    search: "",
    categoriaId: "",
    pageSize: "20",
  });
  const [invApplied, setInvApplied] = useState<typeof invDraft | null>(null);
  const [invPage, setInvPage] = useState(1);
  const [invInboundPage, setInvInboundPage] = useState(1);
  const [invInboundFormDraft, setInvInboundFormDraft] = useState<{ id_inventario: string; cantidad: string; motivo: string }>({
    id_inventario: "",
    cantidad: "",
    motivo: "",
  });
  const [invInboundSearchDraft, setInvInboundSearchDraft] = useState("");
  const [invInboundSearchOpen, setInvInboundSearchOpen] = useState(false);
  const [invInboundSearchActiveIndex, setInvInboundSearchActiveIndex] = useState<number>(-1);
  const [invInboundFormError, setInvInboundFormError] = useState<string | null>(null);
  const [invInboundSuccess, setInvInboundSuccess] = useState<string | null>(null);
  const invInboundSearchWrapRef = useRef<HTMLDivElement | null>(null);

  // Process jump intent during render (React 19 recommended pattern)
  const [prevJump, setPrevJump] = useState<typeof jumpIntent>(null);
  if (jumpIntent && jumpIntent !== prevJump) {
    setPrevJump(jumpIntent);
    setInvPage(1);
    setInvInboundPage(1);
    setInvApplied(s => s ?? { ...invDraft });
  }

  // Side effect: consume jump intent
  useEffect(() => {
    if (jumpIntent) onConsumeJump();
  }, [jumpIntent, onConsumeJump]);

  useEffect(() => {
    if (!invInboundSearchOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (invInboundSearchWrapRef.current?.contains(target)) return;
      setInvInboundSearchOpen(false);
      setInvInboundSearchActiveIndex(-1);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [invInboundSearchOpen]);

  const {
    data: invKpis,
    isLoading: invKpisLoading,
    error: invKpisError,
  } = useQuery<InventoryKpis>({
    queryKey: ["admin", "inventory", "kpis"],
    queryFn: fetchInventoryKpis,
    staleTime: 30 * 1000,
  });

  const {
    data: invCategoryOptions,
    isLoading: invCategoryOptionsLoading,
    error: invCategoryOptionsError,
  } = useQuery<ProductCatalogOption[]>({
    queryKey: ["admin", "inventory", "categories"],
    queryFn: fetchInventoryCategories,
    staleTime: 5 * 60 * 1000,
  });

  const {
    data: invPaginated,
    isLoading: invPaginatedLoading,
    error: invPaginatedError,
  } = useQuery<InventoryPaginatedResponse>({
    queryKey: ["admin", "inventory", "paginated", invPage, invApplied?.search || "", invApplied?.categoriaId || "", invApplied?.pageSize || "20"],
    queryFn: () => {
      const f = invApplied;
      if (!f) throw new Error("Filtros no aplicados");
      return fetchInventoryPaginated({
        page: invPage,
        pageSize: f.pageSize,
        search: f.search || undefined,
        categoriaId: f.categoriaId || undefined,
      });
    },
    enabled: !!invApplied,
  });

  const {
    data: inboundRows,
    isLoading: inboundLoading,
    error: inboundError,
  } = useQuery<InboundResponse>({
    queryKey: [
      "admin",
      "inventory",
      "inbound",
      invInboundPage,
      invApplied?.search || "",
      invApplied?.categoriaId || "",
      invApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = invApplied;
      if (!f) throw new Error("Filtros no aplicados");
      return fetchInbound({
        page: invInboundPage,
        pageSize: f.pageSize,
        search: f.search || undefined,
        categoriaId: f.categoriaId || undefined,
      });
    },
    enabled: !!invApplied,
  });

  const createInboundInventory = useMutation({
    mutationFn: (payload: { id_inventario: number; cantidad: number; motivo: string }) => createInbound(payload),
    onSuccess: async data => {
      setInvInboundFormError(null);
      setInvInboundFormDraft({ id_inventario: "", cantidad: "", motivo: "" });
      setInvInboundSearchDraft("");
      setInvInboundSearchOpen(false);
      setInvInboundSearchActiveIndex(-1);
      setInvInboundPage(1);

      const producto = String(data?.entry?.producto || "producto");
      const stockNuevo = Number(data?.stock?.nuevo || 0);
      setInvInboundSuccess(`Entrada registrada para ${producto}. Stock actualizado: ${stockNuevo}.`);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin", "inventory", "paginated"] }),
        qc.invalidateQueries({ queryKey: ["admin", "inventory", "inbound"] }),
        qc.invalidateQueries({ queryKey: ["admin", "audit"] }),
      ]);
    },
  });

  const invInboundSelectedId = useMemo(() => {
    const parsed = Number(invInboundFormDraft.id_inventario);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [invInboundFormDraft.id_inventario]);

  const invInboundSelectedRow = useMemo(() => {
    if (!invInboundSelectedId) return null;
    return (invPaginated?.rows || []).find(r => Number(r.id_inventario) === invInboundSelectedId) || null;
  }, [invInboundSelectedId, invPaginated?.rows]);

  const invInboundSearchCandidates = useMemo(() => {
    const source = invPaginated?.rows || [];
    const term = invInboundSearchDraft.trim().toLowerCase();
    if (!term) return [];
    return source
      .filter(r => {
        const haystack = `${r.id_inventario} ${r.nombre_producto}`.toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 50);
  }, [invInboundSearchDraft, invPaginated?.rows]);

  const invInboundListboxId = "admin-inbound-search-listbox";
  const invInboundSearchTerm = invInboundSearchDraft.trim();
  const invInboundDropdownVisible = invInboundSearchOpen && invInboundSearchTerm.length > 0;

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Inventario</h4>
            <div className="text-muted small">Vista operativa con KPIs, filtros avanzados y stock semaforizado.</div>
          </div>

          <div className="d-flex gap-2 flex-wrap">
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => {
                const f = invApplied;
                if (!f) return;
                const q = new URLSearchParams();
                if (f.search.trim()) q.set("search", f.search.trim());
                if (f.categoriaId.trim()) q.set("categoriaId", f.categoriaId.trim());
                const qs = q.toString();
                exportFile(`/inventory/export/admin${qs ? `?${qs}` : ""}`, "inventario-admin.csv");
              }}
              disabled={exportingGeneric || !invApplied || (invPaginated?.rows?.length ?? 0) <= 0}
            >
              {exportingGeneric ? "Exportando..." : "Exportar inventario (CSV)"}
            </button>
          </div>
        </div>

        {genericExportError ? <div className="alert alert-danger">{genericExportError}</div> : null}
        {invKpisError ? <div className="alert alert-danger">{getErrorMessage(invKpisError)}</div> : null}

        <div className="row g-2 mb-3">
          <div className="col-12 col-md-4">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Productos con stock</div>
              <div className="d-flex align-items-center justify-content-between">
                <div className="fs-4 fw-semibold">{invKpisLoading ? "…" : (invKpis?.totalProductos ?? "—")}</div>
                <span className="badge text-bg-success">OK</span>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Agotados</div>
              <div className="d-flex align-items-center justify-content-between">
                <div className="fs-4 fw-semibold">{invKpisLoading ? "…" : (invKpis?.agotados ?? "—")}</div>
                <span className="badge text-bg-danger">Alerta</span>
              </div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Stock bajo (≤ 10)</div>
              <div className="d-flex align-items-center justify-content-between">
                <div className="fs-4 fw-semibold">{invKpisLoading ? "…" : (invKpis?.stockBajo ?? "—")}</div>
                <span className="badge text-bg-warning">Revisar</span>
              </div>
            </div>
          </div>
        </div>

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            setInvPage(1);
            setInvInboundPage(1);
            setInvApplied({ ...invDraft });
          }}
        >
          <div className="col-sm-6 col-md-4">
            <label className="form-label" htmlFor="inv-search">
              Buscar producto
            </label>
            <input
              id="inv-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="Nombre del producto"
              value={invDraft.search}
              onChange={e => setInvDraft(s => ({ ...s, search: e.target.value }))}
            />
          </div>
          <div className="col-sm-6 col-md-4">
            <label className="form-label" htmlFor="inv-categoria">
              Categoría
            </label>
            <select
              id="inv-categoria"
              className="form-select form-select-sm"
              value={invDraft.categoriaId}
              onChange={e => setInvDraft(s => ({ ...s, categoriaId: e.target.value }))}
              disabled={invCategoryOptionsLoading}
            >
              <option value="">Todas las categorías</option>
              {(invCategoryOptions || []).map(c => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-sm-4 col-md-1">
            <label className="form-label" htmlFor="inv-page-size">
              Tamaño
            </label>
            <select
              id="inv-page-size"
              className="form-select form-select-sm"
              value={invDraft.pageSize}
              onChange={e => setInvDraft(s => ({ ...s, pageSize: e.target.value }))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="col-sm-4 col-md-1">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Aplicar
            </button>
          </div>
          <div className="col-sm-4 col-md-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary w-100"
              onClick={() => {
                const clean = { search: "", categoriaId: "", pageSize: "20" };
                setInvDraft(clean);
                setInvApplied(null);
                setInvPage(1);
                setInvInboundPage(1);
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        {invCategoryOptionsError ? <div className="alert alert-warning">{getErrorMessage(invCategoryOptionsError)}</div> : null}
        {invPaginatedError ? <div className="alert alert-danger">{getErrorMessage(invPaginatedError)}</div> : null}
        {inboundError ? <div className="alert alert-danger">{getErrorMessage(inboundError)}</div> : null}

        {!invApplied ? <div className="alert alert-info">Aplica filtros para cargar el inventario.</div> : null}

        {invApplied && invPaginatedLoading ? <div className="text-muted">Cargando...</div> : null}

        {invApplied && !invPaginatedLoading && invPaginated && invPaginated.rows.length === 0 ? (
          <div className="alert alert-info mb-0">Sin resultados para los filtros actuales.</div>
        ) : null}

        {invApplied && !invPaginatedLoading && invPaginated && invPaginated.rows.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th className="text-end">Precio</th>
                  <th className="text-end">Stock</th>
                  <th className="text-end" style={{ width: 150 }}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {invPaginated.rows.map(r => (
                  <tr key={r.id_inventario}>
                    <td>{r.nombre_producto}</td>
                    <td>{r.nombre_categoria || "Sin categoría"}</td>
                    <td className="text-end">S/ {money.format(Number(r.precio || 0))}</td>
                    <td>
                      <div className="d-flex justify-content-end">
                        {Number(r.stock || 0) === 0 ? <span className="badge text-bg-danger">Agotado</span> : null}
                        {Number(r.stock || 0) > 0 && Number(r.stock || 0) <= 10 ? <span className="badge text-bg-warning">{r.stock}</span> : null}
                        {Number(r.stock || 0) > 10 ? <span className="badge text-bg-success">{r.stock}</span> : null}
                      </div>
                    </td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => {
                          setInvInboundFormDraft(s => ({ ...s, id_inventario: String(r.id_inventario) }));
                          setInvInboundSearchDraft(getInventorySelectionLabel(r));
                          setInvInboundFormError(null);
                          setInvInboundSearchOpen(false);
                          setInvInboundSearchActiveIndex(-1);
                        }}
                      >
                        Usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
              <div className="small text-muted">
                Página {invPaginated.page} de {invPaginated.totalPages} · {invPaginated.total} registros
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Paginación inventario">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={invPaginated.page <= 1 || invPaginatedLoading}
                  onClick={() => setInvPage(p => Math.max(p - 1, 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={invPaginated.page >= invPaginated.totalPages || invPaginatedLoading}
                  onClick={() => setInvPage(p => Math.min(p + 1, invPaginated.totalPages))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <hr className="my-4" />
        <div className="d-flex align-items-start justify-content-between flex-column flex-md-row gap-2 mb-2">
          <div>
            <h6 className="mb-1">Registrar entrada (modo administrativo)</h6>
            <div className="small text-muted">
              Esta acción se usa para contingencias o control. El registro operativo principal se mantiene en el dashboard de empleado.
            </div>
          </div>
        </div>

        {invInboundSuccess ? <div className="alert alert-success py-2">{invInboundSuccess}</div> : null}
        {createInboundInventory.isError ? <div className="alert alert-danger py-2">{getErrorMessage(createInboundInventory.error)}</div> : null}
        {invInboundFormError ? <div className="alert alert-warning py-2">{invInboundFormError}</div> : null}

        <form
          className="row g-2 align-items-end"
          onSubmit={e => {
            e.preventDefault();
            setInvInboundFormError(null);
            setInvInboundSuccess(null);

            const idInventario = Number(invInboundFormDraft.id_inventario);
            const cantidad = Number(invInboundFormDraft.cantidad);
            const motivo = invInboundFormDraft.motivo.trim();

            if (!Number.isInteger(idInventario) || idInventario <= 0) {
              setInvInboundFormError("Selecciona un producto válido desde el buscador.");
              return;
            }
            if (!Number.isInteger(cantidad) || cantidad <= 0) {
              setInvInboundFormError("Ingresa una cantidad válida mayor que 0.");
              return;
            }
            if (!motivo) {
              setInvInboundFormError("Ingresa el motivo de la entrada.");
              return;
            }

            createInboundInventory.mutate({ id_inventario: idInventario, cantidad, motivo });
          }}
        >
          <div className="col-12 col-lg-6">
            <label className="form-label" htmlFor="admin-inbound-search">
              Buscar producto para entrada
            </label>
            <div className="position-relative" ref={invInboundSearchWrapRef}>
              <input
                id="admin-inbound-search"
                type="search"
                className="form-control form-control-sm"
                placeholder="Nombre de producto o ID inventario"
                value={invInboundSearchDraft}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={invInboundDropdownVisible}
                aria-controls={invInboundListboxId}
                aria-activedescendant={
                  invInboundDropdownVisible && invInboundSearchActiveIndex >= 0 && invInboundSearchActiveIndex < invInboundSearchCandidates.length
                    ? `admin-inbound-option-${invInboundSearchCandidates[invInboundSearchActiveIndex].id_inventario}`
                    : undefined
                }
                onFocus={() => {
                  if (invInboundSearchDraft.trim().length > 0) {
                    setInvInboundSearchOpen(true);
                  }
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    setInvInboundSearchOpen(false);
                    setInvInboundSearchActiveIndex(-1);
                  }, 120);
                }}
                onKeyDown={e => {
                  if (e.key === "Escape") {
                    setInvInboundSearchOpen(false);
                    setInvInboundSearchActiveIndex(-1);
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    if (!invInboundSearchDraft.trim()) return;
                    e.preventDefault();
                    setInvInboundSearchOpen(true);
                    if (invInboundSearchCandidates.length > 0) {
                      setInvInboundSearchActiveIndex(prev => {
                        const next = prev + 1;
                        return next >= invInboundSearchCandidates.length ? 0 : next;
                      });
                    }
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    if (!invInboundSearchDraft.trim() || invInboundSearchCandidates.length === 0) return;
                    e.preventDefault();
                    setInvInboundSearchOpen(true);
                    setInvInboundSearchActiveIndex(prev => {
                      if (prev < 0) return invInboundSearchCandidates.length - 1;
                      const next = prev - 1;
                      return next < 0 ? invInboundSearchCandidates.length - 1 : next;
                    });
                    return;
                  }
                  if (e.key === "Enter") {
                    if (!invInboundSearchDraft.trim()) return;
                    e.preventDefault();
                    const targetIndex =
                      invInboundSearchActiveIndex >= 0 ? invInboundSearchActiveIndex : invInboundSearchCandidates.length > 0 ? 0 : -1;
                    if (targetIndex < 0) return;
                    const row = invInboundSearchCandidates[targetIndex];
                    if (!row) return;
                    setInvInboundFormDraft(s => ({ ...s, id_inventario: String(row.id_inventario) }));
                    setInvInboundSearchDraft(getInventorySelectionLabel(row));
                    setInvInboundFormError(null);
                    setInvInboundSearchOpen(false);
                    setInvInboundSearchActiveIndex(-1);
                    return;
                  }
                }}
                onChange={e => {
                  const nextValue = e.target.value;
                  setInvInboundSearchDraft(nextValue);
                  setInvInboundSearchOpen(nextValue.trim().length > 0);
                  setInvInboundSearchActiveIndex(-1);
                  setInvInboundFormError(null);
                  setInvInboundFormDraft(s => ({ ...s, id_inventario: "" }));
                }}
              />

              {invInboundDropdownVisible ? (
                <div
                  id={invInboundListboxId}
                  className="position-absolute start-0 top-100 mt-1 bg-white border rounded shadow-sm"
                  style={{ width: "100%", zIndex: 1070, maxHeight: 240, overflowY: "auto" }}
                  role="listbox"
                  aria-label="Resultados de búsqueda para entrada"
                >
                  {invPaginatedError ? <div className="px-2 py-2 small text-danger">No se pudo cargar inventario para sugerencias.</div> : null}
                  {!invPaginatedError && invInboundSearchCandidates.length === 0 ? (
                    <div className="px-2 py-2 small text-muted">Sin coincidencias en la página actual de inventario.</div>
                  ) : null}

                  {!invPaginatedError
                    ? invInboundSearchCandidates.map((r, index) => {
                        const isSelected = Number(invInboundFormDraft.id_inventario) === Number(r.id_inventario);
                        const isActive = invInboundSearchActiveIndex === index;
                        return (
                          <button
                            id={`admin-inbound-option-${r.id_inventario}`}
                            key={`admin-inbound-sel-${r.id_inventario}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 border-bottom rounded-0 ${isSelected || isActive ? "active" : ""}`}
                            onMouseDown={event => event.preventDefault()}
                            onMouseEnter={() => setInvInboundSearchActiveIndex(index)}
                            onClick={() => {
                              setInvInboundFormDraft(s => ({ ...s, id_inventario: String(r.id_inventario) }));
                              setInvInboundSearchDraft(getInventorySelectionLabel(r));
                              setInvInboundFormError(null);
                              setInvInboundSearchOpen(false);
                              setInvInboundSearchActiveIndex(-1);
                            }}
                          >
                            <span className="small">{getInventorySelectionLabel(r)}</span>
                            <span className={`badge ${isSelected || isActive ? "text-bg-light text-dark" : "text-bg-secondary"}`}>
                              Stock {r.stock || 0}
                            </span>
                          </button>
                        );
                      })
                    : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="col-12 col-md-3 col-lg-2">
            <label className="form-label" htmlFor="admin-inbound-quantity">
              Cantidad
            </label>
            <input
              id="admin-inbound-quantity"
              type="number"
              min="1"
              className="form-control form-control-sm"
              placeholder="Cantidad"
              value={invInboundFormDraft.cantidad}
              onChange={e => setInvInboundFormDraft(s => ({ ...s, cantidad: e.target.value }))}
            />
          </div>

          <div className="col-12 col-md-9 col-lg-4">
            <label className="form-label" htmlFor="admin-inbound-reason">
              Motivo
            </label>
            <input
              id="admin-inbound-reason"
              type="text"
              className="form-control form-control-sm"
              placeholder="Ej: Compra mayorista, ajuste positivo, devolución cliente"
              value={invInboundFormDraft.motivo}
              onChange={e => setInvInboundFormDraft(s => ({ ...s, motivo: e.target.value }))}
            />
          </div>

          <div className="col-12 d-flex flex-wrap gap-2 mt-2">
            <button type="submit" className="btn btn-sm btn-primary" disabled={createInboundInventory.isPending}>
              {createInboundInventory.isPending ? "Registrando..." : "Registrar entrada"}
            </button>
            {invInboundSelectedId ? (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => {
                  setInvInboundFormDraft(s => ({ ...s, id_inventario: "" }));
                  setInvInboundSearchDraft("");
                  setInvInboundSearchOpen(false);
                  setInvInboundSearchActiveIndex(-1);
                }}
              >
                Limpiar selección
              </button>
            ) : null}
          </div>
        </form>

        {invInboundSelectedRow ? (
          <div className="alert alert-light border mt-3 mb-0">
            <div className="small text-muted">Producto seleccionado</div>
            <div className="fw-semibold">{invInboundSelectedRow.nombre_producto}</div>
            <div className="small text-muted">
              ID inventario: {invInboundSelectedRow.id_inventario} · Stock actual: {invInboundSelectedRow.stock}
            </div>
          </div>
        ) : null}

        <hr className="my-4" />
        <div className="d-flex align-items-start justify-content-between flex-column flex-md-row gap-2 mb-2">
          <div>
            <h6 className="mb-1">Entradas de inventario</h6>
            <div className="small text-muted">Trazabilidad de ingresos registrados para los filtros aplicados.</div>
          </div>
        </div>

        {invApplied && inboundLoading ? <div className="text-muted">Cargando entradas...</div> : null}

        {invApplied && !inboundLoading && inboundRows && inboundRows.rows.length === 0 ? (
          <div className="alert alert-info mb-0">Sin entradas de inventario para los filtros actuales.</div>
        ) : null}

        {invApplied && !inboundLoading && inboundRows && inboundRows.rows.length > 0 ? (
          <div className="table-responsive mt-3">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>Fecha</th>
                  <th>Producto</th>
                  <th className="text-end" style={{ width: 120 }}>
                    Cant.
                  </th>
                  <th>Motivo</th>
                  <th>Responsable</th>
                </tr>
              </thead>
              <tbody>
                {inboundRows.rows.map(r => (
                  <tr key={r.id_entrada_inventario}>
                    <td className="text-nowrap">
                      {(() => {
                        const dt = formatDateTime(r.fecha_entrada_utc, "datetime");
                        if (!dt) return <span className="text-muted">—</span>;
                        return (
                          <div title={dt.raw}>
                            <div className="fw-semibold">{dt.date}</div>
                            <div className="text-muted small">{dt.time}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>{r.producto}</td>
                    <td className="text-end fw-semibold">{r.cantidad}</td>
                    <td>{r.motivo || "—"}</td>
                    <td>{r.responsable || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
              <div className="small text-muted">
                Página {inboundRows.page} de {inboundRows.totalPages} · {inboundRows.total} registros
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Paginación entradas inventario">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={inboundRows.page <= 1 || inboundLoading}
                  onClick={() => setInvInboundPage(p => Math.max(p - 1, 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={inboundRows.page >= inboundRows.totalPages || inboundLoading}
                  onClick={() => setInvInboundPage(p => Math.min(p + 1, inboundRows.totalPages))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
