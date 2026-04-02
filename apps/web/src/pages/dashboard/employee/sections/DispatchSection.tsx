import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { useExportFile } from "../../shared/hooks/useExportFile";
import { useDebounce } from "../../shared/hooks/useDebounce";
import { PaginationControls } from "../../shared/components/PaginationControls";
import { fetchOutbound, searchDispatchInventory, createDispatch } from "../../shared/services/dispatchService";
import { getErrorMessage } from "../../shared/utils/errors";
import {
  createDefaultDispatchFilters,
  createEmptyDispatchItem,
  getDispatchDuplicateInventoryIds,
  getDispatchItemErrorMessage,
  ensureDispatchFiltersIncludeDate,
} from "../../shared/utils/dispatch-helpers";
import { getTodayDateInputInLima } from "../../shared/utils/format";
import type { InventoryRow } from "../../shared/types/inventory.types";
import type { OutboundResponse } from "../../shared/types/inventory.types";
import type {
  DispatchDraftItem,
  DispatchListFilters,
  DispatchInventorySearchResponse,
  DispatchCreateResponse,
} from "../../shared/types/dispatch.types";

export function DispatchSection() {
  const qc = useQueryClient();
  const { exporting, exportError, exportFile } = useExportFile();

  /* ── create‑dispatch state ── */
  const [dispatchCreateDraft, setDispatchCreateDraft] = useState<{ observacion: string; items: DispatchDraftItem[] }>({
    observacion: "",
    items: [createEmptyDispatchItem()],
  });
  const [dispatchFormError, setDispatchFormError] = useState<string | null>(null);
  const [, setDispatchSubmitAttempted] = useState(false);

  /* ── inline inventory search ── */
  const [searchActiveIndex, setSearchActiveIndex] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const searchDebounced = useDebounce(searchTerm.trim(), 300);
  const [cacheById, setCacheById] = useState<Record<number, InventoryRow>>({});

  /* ── outbound list state ── */
  const [dispatchDraft, setDispatchDraft] = useState<DispatchListFilters>(() => createDefaultDispatchFilters());
  const [dispatchApplied, setDispatchApplied] = useState<DispatchListFilters | null>(null);
  const [dispatchPage, setDispatchPage] = useState(1);
  const [dispatchFilterError, setDispatchFilterError] = useState<string | null>(null);
  const [dispatchListNotice, setDispatchListNotice] = useState<string | null>(null);

  /* ── toasts ── */
  const [createSuccessDismissed, setCreateSuccessDismissed] = useState(false);
  const [listNoticeDismissed, setListNoticeDismissed] = useState(false);
  const [createToastClosing, setCreateToastClosing] = useState(false);
  const [listToastClosing, setListToastClosing] = useState(false);
  const createToastTimerRef = useRef<number | null>(null);
  const listToastTimerRef = useRef<number | null>(null);

  /* ── cleanup toast timers ── */
  useEffect(() => {
    return () => {
      if (createToastTimerRef.current != null) window.clearTimeout(createToastTimerRef.current);
      if (listToastTimerRef.current != null) window.clearTimeout(listToastTimerRef.current);
    };
  }, []);

  /* ── queries ── */
  const {
    data: outboundRows,
    isLoading: outboundLoading,
    error: outboundError,
  } = useQuery<OutboundResponse>({
    queryKey: [
      "employee",
      "dispatch",
      "outbound",
      dispatchPage,
      dispatchApplied?.fechaInicio || "",
      dispatchApplied?.fechaFin || "",
      dispatchApplied?.search || "",
      dispatchApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = dispatchApplied || createDefaultDispatchFilters();
      return fetchOutbound({ page: dispatchPage, pageSize: f.pageSize, fechaInicio: f.fechaInicio, fechaFin: f.fechaFin, search: f.search });
    },
    enabled: !!dispatchApplied,
  });

  const {
    data: inventorySearchResult,
    isLoading: inventorySearchLoading,
    error: inventorySearchError,
  } = useQuery<DispatchInventorySearchResponse>({
    queryKey: ["employee", "dispatch", "inventory-search", searchDebounced],
    queryFn: () => searchDispatchInventory({ search: searchDebounced }),
    enabled: searchActiveIndex !== null && searchDebounced.length > 0,
  });

  /* ── mutations ── */
  const createDispatchMut = useMutation<
    DispatchCreateResponse,
    unknown,
    { observacion: string; items: Array<{ id_inventario: number; cantidad: number }> }
  >({
    mutationFn: createDispatch,
    onSuccess: async () => {
      // Reset create toast state (moved from useEffect)
      if (createToastTimerRef.current != null) {
        window.clearTimeout(createToastTimerRef.current);
        createToastTimerRef.current = null;
      }
      setCreateSuccessDismissed(false);
      setCreateToastClosing(false);

      setDispatchFormError(null);
      setDispatchSubmitAttempted(false);
      setDispatchCreateDraft({ observacion: "", items: [createEmptyDispatchItem()] });
      setSearchActiveIndex(null);
      setSearchTerm("");
      setDispatchPage(1);

      const baseFilters = dispatchApplied || dispatchDraft;
      const todayLima = getTodayDateInputInLima();
      const { next, adjusted } = ensureDispatchFiltersIncludeDate(baseFilters, todayLima);

      setDispatchApplied(next);

      // Reset list toast state (moved from useEffect)
      if (listToastTimerRef.current != null) {
        window.clearTimeout(listToastTimerRef.current);
        listToastTimerRef.current = null;
      }
      setListNoticeDismissed(false);
      setListToastClosing(false);

      if (adjusted) {
        setDispatchDraft(next);
        setDispatchListNotice(`Salida registrada. Se ajustó el rango de fechas para incluir hoy (${todayLima}) y mostrar el nuevo registro.`);
      } else {
        setDispatchListNotice("Salida registrada. Mostrando resultados más recientes en la página 1.");
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee", "dispatch", "outbound"] }),
        qc.invalidateQueries({ queryKey: ["employee", "inventory"] }),
        qc.invalidateQueries({ queryKey: ["employee", "dispatch", "inventory-search"] }),
      ]);
      await qc.refetchQueries({ queryKey: ["employee", "dispatch", "outbound"], type: "active" });
    },
  });

  function closeCreateToast() {
    if (createToastClosing) return;
    setCreateToastClosing(true);
    createToastTimerRef.current = window.setTimeout(() => {
      setCreateSuccessDismissed(true);
      setCreateToastClosing(false);
      createToastTimerRef.current = null;
    }, 140);
  }

  function closeListToast() {
    if (listToastClosing) return;
    setListToastClosing(true);
    listToastTimerRef.current = window.setTimeout(() => {
      setListNoticeDismissed(true);
      setListToastClosing(false);
      listToastTimerRef.current = null;
    }, 140);
  }

  /* ── derived ── */
  const inventoryById = useMemo(() => {
    const map = new Map<number, InventoryRow>();
    for (const row of Object.values(cacheById)) map.set(Number(row.id_inventario), row);
    for (const row of inventorySearchResult?.rows || []) map.set(Number(row.id_inventario), row);
    return map;
  }, [cacheById, inventorySearchResult]);

  const duplicateIds = useMemo(() => getDispatchDuplicateInventoryIds(dispatchCreateDraft.items), [dispatchCreateDraft.items]);

  const dispatchAppliedSummary = useMemo(() => {
    const f = dispatchApplied;
    if (!f) return "Sin filtros activos";
    const parts: string[] = [];
    if (f.fechaInicio.trim() || f.fechaFin.trim()) parts.push(`Rango: ${f.fechaInicio || "…"} → ${f.fechaFin || "…"}`);
    if (f.search.trim()) parts.push(`Buscar: ${f.search.trim()}`);
    parts.push(`Tamaño: ${f.pageSize || "20"}`);
    return parts.join(" · ");
  }, [dispatchApplied]);

  function handleExport() {
    const f = dispatchApplied || createDefaultDispatchFilters();
    const q = new URLSearchParams();
    if (f.fechaInicio.trim()) q.set("fechaInicio", f.fechaInicio.trim());
    if (f.fechaFin.trim()) q.set("fechaFin", f.fechaFin.trim());
    if (f.search.trim()) q.set("search", f.search.trim());
    const qs = q.toString();
    exportFile(`/dispatch/outbound/export${qs ? `?${qs}` : ""}`, "despachos.csv");
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex justify-content-end mb-3">
          <button className="btn btn-outline-primary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exportando..." : "Exportar despachos (CSV)"}
          </button>
        </div>

        {exportError ? <div className="alert alert-danger">{exportError}</div> : null}

        {/* ── toast stack ── */}
        {(createDispatchMut.isSuccess && !createSuccessDismissed) || (dispatchListNotice && !listNoticeDismissed) ? (
          <div className="dispatch-toast-stack" role="status" aria-live="polite" aria-atomic="false">
            {createDispatchMut.isSuccess && !createSuccessDismissed ? (
              <div className={`dispatch-toast${createToastClosing ? " dispatch-toast--closing" : ""}`} role="alert">
                <span className="dispatch-toast-text">Despacho registrado.</span>
                <button type="button" className="dispatch-toast-close" aria-label="Cerrar mensaje" onClick={closeCreateToast}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ) : null}
            {dispatchListNotice && !listNoticeDismissed ? (
              <div className={`dispatch-toast${listToastClosing ? " dispatch-toast--closing" : ""}`} role="alert">
                <span className="dispatch-toast-text">{dispatchListNotice}</span>
                <button type="button" className="dispatch-toast-close" aria-label="Cerrar mensaje" onClick={closeListToast}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── two‑column: create + filter ── */}
        <div className="row g-3">
          {/* Paso 1 */}
          <div className="col-12 col-lg-6">
            <div className="card border">
              <div className="card-body">
                <h6 className="mb-1">Paso 1: Registrar salida</h6>
                <div className="small text-muted mb-3">Registra una salida manual de inventario con un motivo o referencia clara para el equipo.</div>

                {createDispatchMut.isError ? <div className="alert alert-danger">{getErrorMessage(createDispatchMut.error)}</div> : null}
                {inventorySearchError ? <div className="alert alert-warning">{getErrorMessage(inventorySearchError)}</div> : null}
                {dispatchFormError ? <div className="alert alert-warning py-2">{dispatchFormError}</div> : null}

                <form
                  className="row g-2"
                  onSubmit={e => {
                    e.preventDefault();
                    setDispatchFormError(null);
                    setDispatchSubmitAttempted(true);

                    const normalizedItems = dispatchCreateDraft.items.map(it => ({
                      id_inventario: Number(it.id_inventario),
                      cantidad: Number(it.cantidad),
                    }));

                    const hasItemErrors = dispatchCreateDraft.items.some(item =>
                      Boolean(getDispatchItemErrorMessage({ item, inventoryById, duplicateIds, strict: true })),
                    );

                    const items = normalizedItems.filter(
                      it => Number.isFinite(it.id_inventario) && it.id_inventario > 0 && Number.isFinite(it.cantidad) && it.cantidad > 0,
                    );

                    if (items.length === 0) {
                      setDispatchFormError("Agrega al menos 1 ítem válido (inventario y cantidad mayor a 0).");
                      return;
                    }
                    if (hasItemErrors) {
                      setDispatchFormError("Corrige los errores de los ítems antes de registrar el despacho.");
                      return;
                    }
                    createDispatchMut.mutate({ observacion: dispatchCreateDraft.observacion.trim(), items });
                  }}
                >
                  <div className="col-12">
                    <label className="form-label" htmlFor="emp-dispatch-observacion">
                      Motivo o referencia
                    </label>
                    <input
                      id="emp-dispatch-observacion"
                      className="form-control form-control-sm"
                      type="text"
                      value={dispatchCreateDraft.observacion}
                      onChange={e => setDispatchCreateDraft(s => ({ ...s, observacion: e.target.value }))}
                      placeholder="Ej: ajuste interno, merma, traslado no trazado en sistema"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label">Ítems</label>
                    <div className="d-flex flex-column gap-2">
                      {dispatchCreateDraft.items.map((it, i) => {
                        const selectedInventory = inventoryById.get(Number(it.id_inventario));
                        return (
                          <div key={i} className="border rounded p-2">
                            <div className="row g-2 align-items-start">
                              <div className="col-12 col-xl-7">
                                <label className="form-label small text-muted mb-1">Producto o inventario</label>
                                {it.id_inventario.trim() ? (
                                  <div className="border rounded bg-light px-3 py-2 h-100">
                                    <div className="fw-semibold text-break">
                                      {selectedInventory?.nombre_producto || it.selectedLabel || `ID ${it.id_inventario}`}
                                    </div>
                                    <div className="small text-muted text-break">
                                      {selectedInventory
                                        ? `Inventario #${selectedInventory.id_inventario} · Stock ${selectedInventory.stock}`
                                        : it.selectedLabel || `Inventario #${it.id_inventario}`}
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <input
                                      className="form-control form-control-sm"
                                      type="search"
                                      placeholder="Buscar por ID o nombre de producto"
                                      value={it.searchDraft}
                                      onFocus={() => {
                                        setSearchActiveIndex(i);
                                        setSearchTerm(it.searchDraft);
                                      }}
                                      onBlur={() => {
                                        window.setTimeout(() => {
                                          setSearchActiveIndex(prev => (prev === i ? null : prev));
                                        }, 120);
                                      }}
                                      onChange={e => {
                                        const nextValue = e.target.value;
                                        setDispatchCreateDraft(s => ({
                                          ...s,
                                          items: s.items.map((x, idx) =>
                                            idx === i ? { ...x, searchDraft: nextValue, id_inventario: "", selectedLabel: "" } : x,
                                          ),
                                        }));
                                        setSearchActiveIndex(i);
                                        setSearchTerm(nextValue);
                                      }}
                                    />
                                    {searchActiveIndex === i && it.searchDraft.trim() ? (
                                      <div className="border rounded mt-1" style={{ maxHeight: 220, overflowY: "auto" }}>
                                        {inventorySearchLoading ? <div className="small text-muted p-2">Buscando inventario...</div> : null}
                                        {!inventorySearchLoading && (inventorySearchResult?.rows || []).length === 0 ? (
                                          <div className="small text-muted p-2">Sin resultados para la búsqueda actual.</div>
                                        ) : null}
                                        {!inventorySearchLoading
                                          ? (inventorySearchResult?.rows || []).map(row => (
                                              <button
                                                type="button"
                                                key={row.id_inventario}
                                                className="btn btn-sm btn-light w-100 text-start border-0 border-bottom rounded-0"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => {
                                                  const label = `${row.id_inventario} · ${row.nombre_producto} · stock ${row.stock}`;
                                                  setDispatchCreateDraft(s => ({
                                                    ...s,
                                                    items: s.items.map((x, idx) =>
                                                      idx === i
                                                        ? { ...x, id_inventario: String(row.id_inventario), selectedLabel: label, searchDraft: label }
                                                        : x,
                                                    ),
                                                  }));
                                                  setCacheById(prev => ({ ...prev, [row.id_inventario]: row }));
                                                  setSearchActiveIndex(null);
                                                  setSearchTerm("");
                                                }}
                                              >
                                                #{row.id_inventario} · {row.nombre_producto} · stock {row.stock}
                                              </button>
                                            ))
                                          : null}
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </div>

                              <div className="col-12 col-sm-4 col-xl-2">
                                <label className="form-label small text-muted mb-1" htmlFor={`emp-dispatch-cantidad-${i}`}>
                                  Cantidad
                                </label>
                                <input
                                  id={`emp-dispatch-cantidad-${i}`}
                                  className="form-control form-control-sm"
                                  type="number"
                                  min="1"
                                  inputMode="numeric"
                                  placeholder="Cantidad"
                                  value={it.cantidad}
                                  onChange={e =>
                                    setDispatchCreateDraft(s => ({
                                      ...s,
                                      items: s.items.map((x, idx) => (idx === i ? { ...x, cantidad: e.target.value } : x)),
                                    }))
                                  }
                                />
                              </div>

                              <div className="col-12 col-sm-8 col-xl-3">
                                <label className="form-label small text-muted mb-1">Acciones</label>
                                <div className="d-flex gap-2 flex-wrap">
                                  {it.id_inventario.trim() ? (
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => {
                                        setDispatchCreateDraft(s => ({
                                          ...s,
                                          items: s.items.map((x, idx) =>
                                            idx === i ? { ...x, id_inventario: "", selectedLabel: "", searchDraft: "" } : x,
                                          ),
                                        }));
                                        setSearchActiveIndex(i);
                                        setSearchTerm("");
                                      }}
                                    >
                                      Buscar otro
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={dispatchCreateDraft.items.length <= 1}
                                    onClick={() => {
                                      setDispatchCreateDraft(s => ({ ...s, items: s.items.filter((_, idx) => idx !== i) }));
                                      setSearchActiveIndex(prev => {
                                        if (prev === null) return prev;
                                        if (prev === i) return null;
                                        if (prev > i) return prev - 1;
                                        return prev;
                                      });
                                    }}
                                  >
                                    Quitar
                                  </button>
                                </div>
                              </div>

                              {selectedInventory ? (
                                <div className="col-12">
                                  <div className="small text-muted">
                                    Producto: {selectedInventory.nombre_producto} · Stock disponible: {selectedInventory.stock}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="small text-muted mt-2">
                      Busca un item, confirma la cantidad y usa "Buscar otro" si necesitas reemplazar la selección.
                    </div>
                  </div>

                  <div className="col-12 d-flex gap-2 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setDispatchCreateDraft(s => ({ ...s, items: [...s.items, createEmptyDispatchItem()] }))}
                    >
                      + Agregar ítem
                    </button>
                    <button type="submit" className="btn btn-sm btn-primary" disabled={createDispatchMut.isPending}>
                      {createDispatchMut.isPending ? "Registrando..." : "Registrar despacho"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          {/* Paso 2 */}
          <div className="col-12 col-lg-6">
            <div className="card border">
              <div className="card-body">
                <h6 className="mb-1">Paso 2: Filtrar listado</h6>
                <div className="small text-muted mb-3">Define el rango y criterios para consultar despachos registrados.</div>
                <form
                  className="row g-2 align-items-end"
                  onSubmit={e => {
                    e.preventDefault();
                    if (dispatchDraft.fechaInicio.trim() && dispatchDraft.fechaFin.trim() && dispatchDraft.fechaInicio > dispatchDraft.fechaFin) {
                      setDispatchFilterError("El rango de fechas es inválido: la fecha de inicio no puede ser mayor que la fecha fin.");
                      return;
                    }
                    setDispatchFilterError(null);
                    setDispatchListNotice(null);
                    setDispatchPage(1);
                    setDispatchApplied({ ...dispatchDraft });
                  }}
                >
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="emp-disp-fechaInicio">
                      Fecha inicio
                    </label>
                    <input
                      id="emp-disp-fechaInicio"
                      type="date"
                      className="form-control form-control-sm"
                      value={dispatchDraft.fechaInicio}
                      onChange={e => setDispatchDraft(s => ({ ...s, fechaInicio: e.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="emp-disp-fechaFin">
                      Fecha fin
                    </label>
                    <input
                      id="emp-disp-fechaFin"
                      type="date"
                      className="form-control form-control-sm"
                      value={dispatchDraft.fechaFin}
                      onChange={e => setDispatchDraft(s => ({ ...s, fechaFin: e.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label" htmlFor="emp-disp-search">
                      Buscar
                    </label>
                    <input
                      id="emp-disp-search"
                      type="search"
                      className="form-control form-control-sm"
                      placeholder="Producto / motivo / responsable"
                      value={dispatchDraft.search}
                      onChange={e => setDispatchDraft(s => ({ ...s, search: e.target.value }))}
                    />
                  </div>
                  <div className="col-12 col-md-2">
                    <label className="form-label" htmlFor="emp-disp-pageSize">
                      Tamaño
                    </label>
                    <select
                      id="emp-disp-pageSize"
                      className="form-select form-select-sm"
                      value={dispatchDraft.pageSize}
                      onChange={e => setDispatchDraft(s => ({ ...s, pageSize: e.target.value }))}
                    >
                      <option value="10">10</option>
                      <option value="20">20</option>
                      <option value="50">50</option>
                    </select>
                  </div>
                  <div className="col-6 col-md-2">
                    <button type="submit" className="btn btn-sm btn-primary w-100">
                      Aplicar
                    </button>
                  </div>
                  <div className="col-6 col-md-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary w-100"
                      onClick={() => {
                        const clean = createDefaultDispatchFilters();
                        setDispatchDraft(clean);
                        setDispatchApplied(clean);
                        setDispatchPage(1);
                        setDispatchFilterError(null);
                        setDispatchListNotice(null);
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                </form>
                {dispatchFilterError ? <div className="alert alert-warning py-2 mt-2 mb-0">{dispatchFilterError}</div> : null}
              </div>
            </div>
          </div>
        </div>

        <hr className="my-4" />

        {/* Paso 3 */}
        <h6 className="mb-3">Paso 3: Resultados del listado</h6>
        {dispatchApplied ? <div className="small text-muted mb-3">Filtros activos: {dispatchAppliedSummary}</div> : null}

        {outboundError ? <div className="alert alert-danger">{getErrorMessage(outboundError)}</div> : null}
        {!dispatchApplied ? <div className="alert alert-info">Aplica filtros para cargar el listado.</div> : null}
        {dispatchApplied && outboundLoading ? <div className="text-muted">Cargando...</div> : null}

        {dispatchApplied && !outboundLoading && outboundRows && outboundRows.rows.length === 0 ? (
          <div className="alert alert-info mb-0">Sin registros para los filtros actuales.</div>
        ) : null}

        {dispatchApplied && !outboundLoading && outboundRows && outboundRows.rows.length > 0 ? (
          <div className="table-responsive">
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
                {outboundRows.rows.map(r => (
                  <tr key={r.id_salida_inventario}>
                    <td className="text-nowrap">
                      {(() => {
                        const dt = formatDateTime(r.fecha_salida_utc, "datetime");
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

            <PaginationControls
              currentPage={outboundRows.page}
              totalPages={outboundRows.totalPages}
              totalRows={outboundRows.total}
              isLoading={outboundLoading}
              onPageChange={setDispatchPage}
              ariaLabel="Paginación despachos"
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
