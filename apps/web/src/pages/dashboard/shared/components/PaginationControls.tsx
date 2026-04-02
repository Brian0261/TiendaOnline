type PaginationControlsProps = {
  currentPage: number;
  totalPages: number;
  totalRows: number;
  isLoading?: boolean;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
};

export function PaginationControls({
  currentPage,
  totalPages,
  totalRows,
  isLoading,
  onPageChange,
  ariaLabel = "Paginación",
}: PaginationControlsProps) {
  return (
    <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
      <div className="small text-muted">
        Página {currentPage} de {totalPages} · {totalRows} registros
      </div>
      <div className="btn-group btn-group-sm" role="group" aria-label={ariaLabel}>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={currentPage <= 1 || isLoading}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
        >
          Anterior
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={currentPage >= totalPages || isLoading}
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}
