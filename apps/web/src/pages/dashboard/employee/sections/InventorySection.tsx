import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { useExportFile } from "../../shared/hooks/useExportFile";
import { useDebounce } from "../../shared/hooks/useDebounce";
import { SearchCombobox } from "../../shared/components/SearchCombobox";
import { PaginationControls } from "../../shared/components/PaginationControls";
import { fetchInventory, fetchEmployeeInbound, createInbound } from "../../shared/services/inventoryService";
import { getErrorMessage } from "../../shared/utils/errors";
import { getInventorySelectionLabel } from "../../shared/utils/format";
import type { InventoryRow } from "../../shared/types/inventory.types";
import type { InboundResponse, InboundCreateResponse } from "../../shared/types/inventory.types";
import type { SearchComboboxItem } from "../../shared/components/SearchCombobox";

type InventoryTab = "stock" | "inbound-form" | "inbound-history";

export function InventorySection() {
  const qc = useQueryClient();
  const { exporting, exportError, exportFile } = useExportFile();

  const [draft, setDraft] = useState<{ search: string }>({ search: "" });
  const [applied, setApplied] = useState<{ search: string } | null>(null);
  const [activeTab, setActiveTab] = useState<InventoryTab>(() => {
    if (typeof window === "undefined") return "stock";
    const saved = window.sessionStorage.getItem("employee.inventory.activeTab");
    return saved === "stock" || saved === "inbound-form" || saved === "inbound-history" ? saved : "stock";
  });

  const searchDebounced = useDebounce(draft.search.trim(), 350);

  const [inboundPage, setInboundPage] = useState(1);
  const [inboundDraft, setInboundDraft] = useState<{ id_inventario: string; cantidad: string; motivo: string }>({
    id_inventario: "",
    cantidad: "",
    motivo: "",
  });
  const [inboundSearchDraft, setInboundSearchDraft] = useState("");
  const [inboundFormError, setInboundFormError] = useState<string | null>(null);
  const [inboundSuccess, setInboundSuccess] = useState<string | null>(null);

  // Persist active tab
  useState(() => {
    if (typeof window === "undefined") return;
    const handler = () => window.sessionStorage.setItem("employee.inventory.activeTab", activeTab);
    handler();
  });

  const {
    data: inventoryRows,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery<InventoryRow[]>({
    queryKey: ["employee", "inventory", applied, searchDebounced],
    queryFn: () => fetchInventory({ search: searchDebounced }),
    enabled: activeTab === "stock" || activeTab === "inbound-form",
  });

  const { data: inboundRows, isLoading: inboundLoading } = useQuery<InboundResponse>({
    queryKey: ["employee", "inventory", "inbound", inboundPage, applied?.search || ""],
    queryFn: () => fetchEmployeeInbound({ page: inboundPage, search: applied?.search }),
    enabled: activeTab === "inbound-history" && !!applied,
  });

  const createInboundMut = useMutation<InboundCreateResponse, unknown, { id_inventario: number; cantidad: number; motivo: string }>({
    mutationFn: createInbound,
    onSuccess: async data => {
      setInboundFormError(null);
      setInboundDraft({ id_inventario: "", cantidad: "", motivo: "" });
      setInboundSearchDraft("");

      const producto = String(data?.entry?.producto || "producto");
      const stockNuevo = Number(data?.stock?.nuevo || 0);
      setInboundSuccess(`Entrada registrada para ${producto}. Stock actualizado: ${stockNuevo}.`);
      setInboundPage(1);

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["employee", "inventory"] }),
        qc.invalidateQueries({ queryKey: ["employee", "inventory", "inbound"] }),
      ]);
    },
  });

  const inboundSelectedId = useMemo(() => {
    const parsed = Number(inboundDraft.id_inventario);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [inboundDraft.id_inventario]);

  const inboundSelectedRow = useMemo(() => {
    if (!inboundSelectedId) return null;
    return (inventoryRows || []).find(r => Number(r.id_inventario) === inboundSelectedId) || null;
  }, [inventoryRows, inboundSelectedId]);

  const inboundSearchCandidates = useMemo(() => {
    const source = inventoryRows || [];
    const term = inboundSearchDraft.trim().toLowerCase();
    if (!term) return [];
    return source.filter(r => `${r.id_inventario} ${r.nombre_producto}`.toLowerCase().includes(term)).slice(0, 50);
  }, [inventoryRows, inboundSearchDraft]);

  function handleExport() {
    const f = applied || { search: "" };
    const q = new URLSearchParams();
    if (f.search.trim()) q.set("search", f.search.trim());
    const qs = q.toString();
    exportFile(`/inventory/export${qs ? `?${qs}` : ""}`, "inventario.csv");
  }

  function handleSelectForInbound(row: SearchComboboxItem) {
    setInboundDraft(s => ({ ...s, id_inventario: String(row.id_inventario) }));
    setInboundSearchDraft(getInventorySelectionLabel(row as InventoryRow));
    setInboundFormError(null);
  }

  function handleStockSelectForInbound(row: InventoryRow) {
    setInboundDraft(s => ({ ...s, id_inventario: String(row.id_inventario) }));
    setInboundSearchDraft(getInventorySelectionLabel(row));
    setInboundFormError(null);
    setActiveTab("inbound-form");
  }

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex justify-content-end mb-3">
          <button className="btn btn-outline-primary btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exportando..." : "Exportar inventario (CSV)"}
          </button>
        </div>

        {exportError ? <div className="alert alert-danger">{exportError}</div> : null}

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            setApplied({ ...draft });
          }}
        >
          <div className="col-12 col-md-6">
            <label className="form-label" htmlFor="emp-inv-search">
              Buscar producto
            </label>
            <input
              id="emp-inv-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="Nombre o ID inventario"
              value={draft.search}
              onChange={e => setDraft(s => ({ ...s, search: e.target.value }))}
            />
          </div>
          <div className="col-6 col-md-3">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Aplicar
            </button>
          </div>
          <div className="col-6 col-md-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary w-100"
              onClick={() => {
                setDraft({ search: "" });
                setApplied({ search: "" });
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        {inventoryLoading ? <div className="text-muted mb-3">Cargando inventario...</div> : null}
        {inventoryError ? <div className="alert alert-danger mb-3">{getErrorMessage(inventoryError)}</div> : null}

        <ul className="nav nav-tabs mb-3">
          {(["stock", "inbound-form", "inbound-history"] as InventoryTab[]).map(tab => (
            <li className="nav-item" key={tab}>
              <button className={`nav-link ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                {tab === "stock" ? "Stock actual" : tab === "inbound-form" ? "Registrar entrada" : "Historial entradas"}
              </button>
            </li>
          ))}
        </ul>

        {activeTab === "inbound-form" ? (
          <div className="mb-3">
            <h6 className="mb-2">Registrar nueva entrada</h6>
            {inboundFormError ? <div className="alert alert-warning py-2">{inboundFormError}</div> : null}
            {inboundSuccess ? <div className="alert alert-success py-2">{inboundSuccess}</div> : null}
            {createInboundMut.isError ? <div className="alert alert-danger">{getErrorMessage(createInboundMut.error)}</div> : null}

            <form
              className="row g-2 align-items-end"
              onSubmit={e => {
                e.preventDefault();
                setInboundFormError(null);
                setInboundSuccess(null);
                const idInventario = Number(inboundDraft.id_inventario);
                const cantidad = Number(inboundDraft.cantidad);
                const motivo = inboundDraft.motivo.trim();
                if (!Number.isInteger(idInventario) || idInventario <= 0) {
                  setInboundFormError("Selecciona un producto válido desde el buscador.");
                  return;
                }
                if (!Number.isInteger(cantidad) || cantidad <= 0) {
                  setInboundFormError("Ingresa una cantidad válida mayor que 0.");
                  return;
                }
                if (!motivo) {
                  setInboundFormError("Ingresa el motivo de la entrada.");
                  return;
                }
                createInboundMut.mutate({ id_inventario: idInventario, cantidad, motivo });
              }}
            >
              <div className="col-12 col-lg-6">
                <SearchCombobox
                  inputId="emp-inbound-search"
                  label="Buscar producto para entrada"
                  placeholder="Nombre de producto o ID inventario"
                  searchTerm={inboundSearchDraft}
                  onSearchChange={setInboundSearchDraft}
                  candidates={inboundSearchCandidates}
                  onSelect={handleSelectForInbound}
                  selectedId={inboundSelectedId}
                  getItemLabel={getInventorySelectionLabel}
                  hasError={!!inventoryError}
                  errorMessage="No se pudo cargar el stock para sugerencias."
                  emptyMessage="Sin coincidencias en el stock cargado."
                  onClearSelection={() => setInboundDraft(s => ({ ...s, id_inventario: "" }))}
                />
              </div>

              <div className="col-12 col-md-3 col-lg-2">
                <label className="form-label" htmlFor="emp-inbound-quantity">
                  Cantidad
                </label>
                <input
                  id="emp-inbound-quantity"
                  type="number"
                  min="1"
                  className="form-control form-control-sm"
                  placeholder="Cantidad"
                  value={inboundDraft.cantidad}
                  onChange={e => setInboundDraft(s => ({ ...s, cantidad: e.target.value }))}
                />
              </div>

              <div className="col-12 col-md-9 col-lg-4">
                <label className="form-label" htmlFor="emp-inbound-reason">
                  Motivo
                </label>
                <input
                  id="emp-inbound-reason"
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Ej: Compra mayorista, ajuste positivo, devolución cliente"
                  value={inboundDraft.motivo}
                  onChange={e => setInboundDraft(s => ({ ...s, motivo: e.target.value }))}
                />
              </div>

              <div className="col-12 d-flex flex-wrap gap-2 mt-2">
                <button type="submit" className="btn btn-sm btn-primary" disabled={createInboundMut.isPending}>
                  {createInboundMut.isPending ? "Registrando..." : "Registrar entrada"}
                </button>
                {inboundSelectedId ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                      setInboundDraft(s => ({ ...s, id_inventario: "" }));
                      setInboundSearchDraft("");
                    }}
                  >
                    Limpiar selección
                  </button>
                ) : null}
              </div>
            </form>

            {inboundSelectedRow ? (
              <div className="alert alert-light border mt-3 mb-0">
                <div className="small text-muted">Producto seleccionado</div>
                <div className="fw-semibold">{inboundSelectedRow.nombre_producto}</div>
                <div className="small text-muted">
                  ID inventario: {inboundSelectedRow.id_inventario} · Stock actual: {inboundSelectedRow.stock ?? 0}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "stock" ? (
          <>
            <h6 className="mb-2">Stock actual</h6>
            {!inventoryLoading && inventoryRows && inventoryRows.length === 0 ? (
              <div className="alert alert-info mb-0">Sin resultados para los filtros actuales.</div>
            ) : null}
            {!inventoryLoading && inventoryRows && inventoryRows.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>ID inventario</th>
                      <th>Producto</th>
                      <th className="text-end">Stock</th>
                      <th className="text-end" style={{ width: 160 }}>
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRows.map(r => (
                      <tr key={r.id_inventario}>
                        <td className="fw-semibold">#{r.id_inventario}</td>
                        <td>{r.nombre_producto}</td>
                        <td className="text-end fw-semibold">
                          <span className={`badge ${Number(r.stock ?? 0) <= 20 ? "text-bg-warning" : "text-bg-success"}`}>{r.stock ?? 0}</span>
                        </td>
                        <td className="text-end">
                          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => handleStockSelectForInbound(r)}>
                            Usar en entrada
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === "inbound-history" ? (
          <>
            <h6 className="mb-2">Historial de entradas</h6>
            <div className="small text-muted mb-3">Trazabilidad de ingresos con responsable para los filtros aplicados.</div>

            {!applied ? <div className="alert alert-info">Aplica filtros para consultar el historial de entradas.</div> : null}
            {applied && inboundLoading ? <div className="text-muted">Cargando entradas...</div> : null}

            {applied && !inboundLoading && inboundRows && inboundRows.rows.length === 0 ? (
              <div className="alert alert-info mb-0">Sin entradas para los filtros actuales.</div>
            ) : null}

            {applied && !inboundLoading && inboundRows && inboundRows.rows.length > 0 ? (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead>
                    <tr>
                      <th style={{ width: 150 }}>Fecha</th>
                      <th>Producto</th>
                      <th className="text-end" style={{ width: 100 }}>
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

                <PaginationControls
                  currentPage={inboundRows.page}
                  totalPages={inboundRows.totalPages}
                  totalRows={inboundRows.total}
                  isLoading={inboundLoading}
                  onPageChange={setInboundPage}
                  ariaLabel="Paginación entradas empleado"
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
