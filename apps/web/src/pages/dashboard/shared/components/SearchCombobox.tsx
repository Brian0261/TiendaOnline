import { useRef, useState } from "react";
import { useOutsideClick } from "../hooks/useOutsideClick";

export type SearchComboboxItem = {
  id_inventario: number;
  nombre_producto: string;
  stock: number;
  [key: string]: unknown;
};

type SearchComboboxProps = {
  inputId: string;
  label: string;
  placeholder?: string;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  candidates: SearchComboboxItem[];
  onSelect: (item: SearchComboboxItem) => void;
  selectedId: number | null;
  getItemLabel: (item: SearchComboboxItem) => string;
  hasError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  onClearSelection?: () => void;
};

export function SearchCombobox({
  inputId,
  label,
  placeholder = "Buscar…",
  searchTerm,
  onSearchChange,
  candidates,
  onSelect,
  selectedId,
  getItemLabel,
  hasError,
  errorMessage = "No se pudo cargar datos para sugerencias.",
  emptyMessage = "Sin coincidencias.",
  onClearSelection,
}: SearchComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const listboxId = `${inputId}-listbox`;
  const dropdownVisible = isOpen && searchTerm.trim().length > 0;

  useOutsideClick(wrapperRef, isOpen, () => {
    setIsOpen(false);
    setActiveIndex(-1);
  });

  return (
    <div>
      <label className="form-label" htmlFor={inputId}>
        {label}
      </label>
      <div className="position-relative" ref={wrapperRef}>
        <input
          id={inputId}
          type="search"
          className="form-control form-control-sm"
          placeholder={placeholder}
          value={searchTerm}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={dropdownVisible}
          aria-controls={listboxId}
          aria-activedescendant={
            dropdownVisible && activeIndex >= 0 && activeIndex < candidates.length
              ? `${inputId}-option-${candidates[activeIndex].id_inventario}`
              : undefined
          }
          onFocus={() => {
            if (searchTerm.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setActiveIndex(-1);
            }, 120);
          }}
          onKeyDown={e => {
            if (e.key === "Escape") {
              setIsOpen(false);
              setActiveIndex(-1);
              return;
            }

            if (e.key === "ArrowDown") {
              if (!searchTerm.trim()) return;
              e.preventDefault();
              setIsOpen(true);
              if (candidates.length > 0) {
                setActiveIndex(prev => {
                  const next = prev + 1;
                  return next >= candidates.length ? 0 : next;
                });
              }
              return;
            }

            if (e.key === "ArrowUp") {
              if (!searchTerm.trim() || candidates.length === 0) return;
              e.preventDefault();
              setIsOpen(true);
              setActiveIndex(prev => {
                if (prev < 0) return candidates.length - 1;
                const next = prev - 1;
                return next < 0 ? candidates.length - 1 : next;
              });
              return;
            }

            if (e.key === "Enter") {
              if (!searchTerm.trim()) return;
              e.preventDefault();
              const targetIndex = activeIndex >= 0 ? activeIndex : candidates.length > 0 ? 0 : -1;
              if (targetIndex < 0) return;
              const row = candidates[targetIndex];
              if (!row) return;
              onSelect(row);
              setIsOpen(false);
              setActiveIndex(-1);
              return;
            }
          }}
          onChange={e => {
            const nextValue = e.target.value;
            onSearchChange(nextValue);
            setIsOpen(nextValue.trim().length > 0);
            setActiveIndex(-1);
            onClearSelection?.();
          }}
        />

        {dropdownVisible ? (
          <div
            id={listboxId}
            className="position-absolute start-0 top-100 mt-1 bg-white border rounded shadow-sm"
            style={{ width: "100%", zIndex: 1070, maxHeight: 240, overflowY: "auto" }}
            role="listbox"
            aria-label="Resultados de búsqueda para entrada"
          >
            {hasError ? <div className="px-2 py-2 small text-danger">{errorMessage}</div> : null}
            {!hasError && candidates.length === 0 ? <div className="px-2 py-2 small text-muted">{emptyMessage}</div> : null}

            {!hasError
              ? candidates.map((r, index) => {
                  const isSelected = selectedId != null && Number(r.id_inventario) === selectedId;
                  const isActive = activeIndex === index;
                  return (
                    <button
                      id={`${inputId}-option-${r.id_inventario}`}
                      key={`${inputId}-sel-${r.id_inventario}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0 border-bottom rounded-0 ${isSelected || isActive ? "active" : ""}`}
                      onMouseDown={event => event.preventDefault()}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => {
                        onSelect(r);
                        setIsOpen(false);
                        setActiveIndex(-1);
                      }}
                    >
                      <span className="small">{getItemLabel(r)}</span>
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
  );
}
