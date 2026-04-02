import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { fetchAuditHistory } from "../../shared/services/auditService";
import { getErrorMessage } from "../../shared/utils/errors";
import {
  normalizeAuditModule,
  getAuditModuleLabel,
  getAuditActionLabel,
  getAuditRowModule,
  getAuditReferenceLabel,
} from "../../shared/utils/audit-helpers";
import type { AuditRow, AuditModule } from "../../shared/types/audit.types";
import { AUDIT_MODULE_OPTIONS, AUDIT_QUICK_FILTERS } from "../../shared/types/audit.types";

interface Props {
  onJumpFromAudit: (row: AuditRow) => void;
}

export function AuditSection({ onJumpFromAudit }: Props) {
  const [auditDraft, setAuditDraft] = useState<{
    modulo: AuditModule;
    accion: string;
    usuario: string;
    fechaInicio: string;
    fechaFin: string;
    pageSize: string;
  }>({
    modulo: "",
    accion: "",
    usuario: "",
    fechaInicio: "",
    fechaFin: "",
    pageSize: "20",
  });
  const [auditApplied, setAuditApplied] = useState<typeof auditDraft | null>(() => ({
    modulo: "",
    accion: "",
    usuario: "",
    fechaInicio: "",
    fechaFin: "",
    pageSize: "20",
  }));
  const [auditPage, setAuditPage] = useState(1);
  const [auditFilterError, setAuditFilterError] = useState<string | null>(null);
  const [auditExpandedRowId, setAuditExpandedRowId] = useState<number | null>(null);

  const {
    data: auditPaginated,
    isLoading: auditLoading,
    error: auditError,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: [
      "admin",
      "audit",
      "historial",
      auditPage,
      auditApplied?.modulo || "",
      auditApplied?.accion || "",
      auditApplied?.usuario || "",
      auditApplied?.fechaInicio || "",
      auditApplied?.fechaFin || "",
      auditApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = auditApplied;
      if (!f) throw new Error("Filtros no aplicados");
      return fetchAuditHistory({
        page: auditPage,
        pageSize: f.pageSize,
        modulo: f.modulo || undefined,
        accion: f.accion || undefined,
        usuario: f.usuario || undefined,
        fechaInicio: f.fechaInicio || undefined,
        fechaFin: f.fechaFin || undefined,
      });
    },
    enabled: !!auditApplied,
  });

  const auditPageVisibleRows = auditPaginated?.rows?.length ?? 0;
  const auditTotalRows = auditPaginated?.total ?? 0;
  const auditCurrentPage = auditPaginated?.page ?? auditPage;
  const auditTotalPages = auditPaginated?.totalPages ?? 1;

  const auditAppliedSummary = useMemo(() => {
    const f = auditApplied;
    if (!f) return "Ninguno";
    const parts: string[] = [];
    if (f.modulo.trim()) parts.push(`Módulo ${getAuditModuleLabel(normalizeAuditModule(f.modulo))}`);
    if (f.accion.trim()) parts.push(`Acción ${f.accion.trim()}`);
    if (f.usuario.trim()) parts.push(`Usuario ${f.usuario.trim()}`);
    if (f.fechaInicio.trim() && f.fechaFin.trim()) {
      parts.push(`Rango ${f.fechaInicio.trim()} a ${f.fechaFin.trim()}`);
    } else if (f.fechaInicio.trim()) {
      parts.push(`Desde ${f.fechaInicio.trim()}`);
    } else if (f.fechaFin.trim()) {
      parts.push(`Hasta ${f.fechaFin.trim()}`);
    }
    return parts.length ? parts.join(" · ") : "Ninguno";
  }, [auditApplied]);

  const auditActiveFilterCount = useMemo(() => {
    const f = auditApplied;
    if (!f) return 0;
    let count = 0;
    if (f.modulo.trim()) count += 1;
    if (f.accion.trim()) count += 1;
    if (f.usuario.trim()) count += 1;
    if (f.fechaInicio.trim()) count += 1;
    if (f.fechaFin.trim()) count += 1;
    return count;
  }, [auditApplied]);

  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Auditoría (HISTORIAL)</h4>
            <div className="text-muted small">
              Monitoreo administrativo con filtros rápidos, vista contextual y navegación a módulos relacionados.
            </div>
          </div>

          <div className="d-flex gap-2">
            <button className="btn btn-outline-secondary btn-sm" onClick={() => refetchAudit()} disabled={auditLoading}>
              {auditLoading ? "Cargando..." : "Refrescar"}
            </button>
          </div>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-12 col-md-3">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Total encontrados</div>
              <div className="fs-4 fw-semibold">{auditLoading ? "…" : auditTotalRows}</div>
            </div>
          </div>
          <div className="col-12 col-md-3">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Mostrando en esta página</div>
              <div className="fs-4 fw-semibold">{auditLoading ? "…" : auditPageVisibleRows}</div>
            </div>
          </div>
          <div className="col-12 col-md-3">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Página actual</div>
              <div className="fs-4 fw-semibold">{auditLoading ? "…" : `${auditCurrentPage}/${auditTotalPages}`}</div>
            </div>
          </div>
          <div className="col-12 col-md-3">
            <div className="border rounded p-3 h-100 bg-light">
              <div className="small text-muted">Filtros activos</div>
              <div className="fs-4 fw-semibold">{auditActiveFilterCount}</div>
            </div>
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Filtros rápidos de auditoría">
          {AUDIT_QUICK_FILTERS.map(filter => {
            const active = (auditDraft.modulo || "") === filter.modulo;
            return (
              <button
                key={filter.label}
                type="button"
                className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`}
                onClick={() => {
                  setAuditDraft(s => ({ ...s, modulo: filter.modulo }));
                  setAuditApplied(s => ({ ...(s || auditDraft), modulo: filter.modulo }));
                  setAuditPage(1);
                  setAuditExpandedRowId(null);
                }}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            if (auditDraft.fechaInicio.trim() && auditDraft.fechaFin.trim() && auditDraft.fechaInicio > auditDraft.fechaFin) {
              setAuditFilterError("El rango de fechas es inválido: la fecha de inicio no puede ser mayor que la fecha fin.");
              return;
            }
            setAuditFilterError(null);
            setAuditPage(1);
            setAuditApplied({ ...auditDraft });
            setAuditExpandedRowId(null);
          }}
        >
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="audit-modulo">
              Módulo
            </label>
            <select
              id="audit-modulo"
              className="form-select form-select-sm"
              value={auditDraft.modulo}
              onChange={e => setAuditDraft(s => ({ ...s, modulo: normalizeAuditModule(e.target.value) }))}
            >
              {AUDIT_MODULE_OPTIONS.map(opt => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="col-12 col-md-3">
            <label className="form-label" htmlFor="audit-accion">
              Acción
            </label>
            <input
              id="audit-accion"
              type="text"
              className="form-control form-control-sm"
              placeholder="Ej: INVENTARIO_EXPORTADO"
              value={auditDraft.accion}
              onChange={e => setAuditDraft(s => ({ ...s, accion: e.target.value }))}
            />
          </div>
          <div className="col-12 col-md-2">
            <label className="form-label" htmlFor="audit-usuario">
              Usuario
            </label>
            <input
              id="audit-usuario"
              type="text"
              className="form-control form-control-sm"
              placeholder="Nombre, email o ID"
              value={auditDraft.usuario}
              onChange={e => setAuditDraft(s => ({ ...s, usuario: e.target.value }))}
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="audit-fecha-inicio">
              Fecha inicio
            </label>
            <input
              id="audit-fecha-inicio"
              type="date"
              className="form-control form-control-sm"
              value={auditDraft.fechaInicio}
              onChange={e => setAuditDraft(s => ({ ...s, fechaInicio: e.target.value }))}
            />
          </div>
          <div className="col-6 col-md-2">
            <label className="form-label" htmlFor="audit-fecha-fin">
              Fecha fin
            </label>
            <input
              id="audit-fecha-fin"
              type="date"
              className="form-control form-control-sm"
              value={auditDraft.fechaFin}
              onChange={e => setAuditDraft(s => ({ ...s, fechaFin: e.target.value }))}
            />
          </div>
          <div className="col-6 col-md-1">
            <label className="form-label" htmlFor="audit-page-size">
              Tamaño
            </label>
            <select
              id="audit-page-size"
              className="form-select form-select-sm"
              value={auditDraft.pageSize}
              onChange={e => setAuditDraft(s => ({ ...s, pageSize: e.target.value }))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="col-6 col-md-1">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Aplicar
            </button>
          </div>
          <div className="col-6 col-md-1">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary w-100"
              onClick={() => {
                const clean: typeof auditDraft = { modulo: "", accion: "", usuario: "", fechaInicio: "", fechaFin: "", pageSize: "20" };
                setAuditDraft(clean);
                setAuditApplied(clean);
                setAuditPage(1);
                setAuditFilterError(null);
                setAuditExpandedRowId(null);
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        {auditFilterError ? <div className="alert alert-warning py-2">{auditFilterError}</div> : null}
        <div className="small text-muted mb-3">Filtros activos: {auditAppliedSummary}</div>

        {auditError ? <div className="alert alert-danger">{getErrorMessage(auditError)}</div> : null}
        {auditLoading ? <div className="text-muted">Cargando...</div> : null}

        {!auditLoading && auditPaginated && auditPaginated.rows.length === 0 ? (
          <div className="alert alert-info mb-0">Sin registros para los filtros actuales.</div>
        ) : null}

        {!auditLoading && auditPaginated && auditPaginated.rows.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Fecha</th>
                  <th style={{ width: 190 }}>Evento</th>
                  <th style={{ width: 130 }}>Módulo</th>
                  <th>Resumen</th>
                  <th style={{ width: 160 }}>Referencia</th>
                  <th style={{ width: 190 }}>Usuario</th>
                  <th className="text-end" style={{ width: 180 }}>
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {auditPaginated.rows.map(r => {
                  const rowModule = getAuditRowModule(r);
                  const description = String(r.descripcion || "").trim();
                  const semanticSummary = String(r.resumen_label || "").trim();
                  const rowSummary = semanticSummary || description;
                  const expanded = auditExpandedRowId === r.id_historial;
                  const contextLabel =
                    rowModule === "PEDIDO" || rowModule === "DELIVERY"
                      ? "Ir a pedidos"
                      : rowModule === "INVENTARIO"
                        ? "Ir a inventario"
                        : rowModule === "DESPACHO"
                          ? "Ir a despachos"
                          : rowModule === "PRODUCTO"
                            ? "Ir a productos"
                            : rowModule === "CATEGORIA"
                              ? "Ir a categorías"
                              : rowModule === "REPORTE"
                                ? "Ir a reportes"
                                : "Ver panel";

                  return [
                    <tr key={r.id_historial}>
                      <td className="text-nowrap">
                        {(() => {
                          const dt = formatDateTime(r.fecha_accion, "datetime");
                          if (!dt) return <span className="text-muted">—</span>;
                          return (
                            <div title={dt.raw}>
                              <div className="fw-semibold">{dt.date}</div>
                              <div className="text-muted small">{dt.time}</div>
                            </div>
                          );
                        })()}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border" title={r.accion}>
                          {getAuditActionLabel(r.accion)}
                        </span>
                      </td>
                      <td>
                        <span className="badge text-bg-secondary">{getAuditModuleLabel(rowModule)}</span>
                      </td>
                      <td>{rowSummary.length > 120 ? `${rowSummary.slice(0, 120)}...` : rowSummary || "—"}</td>
                      <td>{getAuditReferenceLabel(r)}</td>
                      <td>{r.usuario || "—"}</td>
                      <td className="text-end">
                        <div className="d-inline-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => setAuditExpandedRowId(prev => (prev === r.id_historial ? null : r.id_historial))}
                          >
                            {expanded ? "Ocultar" : "Detalle"}
                          </button>
                          <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => onJumpFromAudit(r)}>
                            {contextLabel}
                          </button>
                        </div>
                      </td>
                    </tr>,
                    expanded ? (
                      <tr key={`${r.id_historial}-detail`} className="table-light">
                        <td colSpan={7}>
                          <div className="small">
                            <div className="mb-1">
                              <span className="text-muted">Acción técnica:</span> <span className="fw-semibold">{r.accion || "—"}</span>
                            </div>
                            <div className="mb-1">
                              <span className="text-muted">Resumen completo:</span> {description || "—"}
                            </div>
                            <div>
                              <span className="text-muted">Referencia técnica:</span> tipo={r.referencia_tipo || "—"} · valor=
                              {r.referencia_valor || "—"}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>

            <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
              <div className="small text-muted">
                Página {auditPaginated.page} de {auditPaginated.totalPages} · {auditPaginated.total} registros · {auditPaginated.pageSize} por página
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Paginación auditoría">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={auditLoading || auditPaginated.page <= 1}
                  onClick={() => setAuditPage(p => Math.max(p - 1, 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={auditLoading || auditPaginated.page >= auditPaginated.totalPages}
                  onClick={() => setAuditPage(p => Math.min(p + 1, auditPaginated.totalPages))}
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
