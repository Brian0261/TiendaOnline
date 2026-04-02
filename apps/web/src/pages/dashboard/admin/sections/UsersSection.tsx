import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "../../../../shared/datetime";
import { getErrorMessage } from "../../shared/utils/errors";
import { formatStateLabel } from "../../shared/utils/format";
import { normalizeManagedUserRole, normalizeManagedUserState, getManagedUserRoleLabel } from "../../shared/utils/user-helpers";
import { fetchUsers, createEmployee, createRider, updateUser, deactivateUser, reactivateUser } from "../../shared/services/usersService";
import type { ManagedUserRole, ManagedUserState } from "../../shared/types/users.types";

export function UsersSection() {
  const qc = useQueryClient();

  /* ── Filtros ─────────────────────────────────────────────── */
  const [usersDraft, setUsersDraft] = useState<{ search: string; rol: ManagedUserRole; estado: ManagedUserState; pageSize: string }>({
    search: "",
    rol: "",
    estado: "ACTIVO",
    pageSize: "20",
  });
  const [usersApplied, setUsersApplied] = useState<typeof usersDraft | null>(() => ({
    search: "",
    rol: "" as ManagedUserRole,
    estado: "ACTIVO" as ManagedUserState,
    pageSize: "20",
  }));
  const [usersPage, setUsersPage] = useState(1);

  /* ── Crear usuario ───────────────────────────────────────── */
  const [showCreateManagedUser, setShowCreateManagedUser] = useState(false);
  const [createManagedUserDraft, setCreateManagedUserDraft] = useState<{
    rol: "EMPLEADO" | "REPARTIDOR";
    nombre: string;
    apellido: string;
    email: string;
    telefono: string;
    direccion_principal: string;
    contrasena: string;
    licencia: string;
  }>({
    rol: "EMPLEADO",
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    direccion_principal: "",
    contrasena: "",
    licencia: "",
  });

  /* ── Editar usuario ──────────────────────────────────────── */
  const [editingManagedUserId, setEditingManagedUserId] = useState<number | null>(null);
  const [editManagedUserDraft, setEditManagedUserDraft] = useState<{
    nombre: string;
    apellido: string;
    email: string;
    telefono: string;
    direccion_principal: string;
    licencia: string;
    rol: ManagedUserRole;
  }>({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    direccion_principal: "",
    licencia: "",
    rol: "",
  });

  /* ── Confirmar desactivación / reactivación ──────────────── */
  const [confirmDeactivateManagedUserId, setConfirmDeactivateManagedUserId] = useState<number | null>(null);
  const [confirmReactivateManagedUserId, setConfirmReactivateManagedUserId] = useState<number | null>(null);

  /* ── Query principal ─────────────────────────────────────── */
  const {
    data: managedUsersPaginated,
    isLoading: managedUsersLoading,
    error: managedUsersError,
  } = useQuery({
    queryKey: [
      "admin",
      "users",
      usersPage,
      usersApplied?.search || "",
      usersApplied?.rol || "",
      usersApplied?.estado || "",
      usersApplied?.pageSize || "20",
    ],
    queryFn: () => {
      const f = usersApplied;
      if (!f) throw new Error("Filtros no aplicados");
      return fetchUsers({
        page: usersPage,
        pageSize: f.pageSize || "20",
        search: f.search,
        rol: f.rol,
        estado: f.estado,
      });
    },
    enabled: !!usersApplied,
  });

  /* ── Mutaciones ──────────────────────────────────────────── */
  const createEmployeeMut = useMutation({
    mutationFn: createEmployee,
    onSuccess: async () => {
      setShowCreateManagedUser(false);
      setCreateManagedUserDraft({
        rol: "EMPLEADO",
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        direccion_principal: "",
        contrasena: "",
        licencia: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const createRiderMut = useMutation({
    mutationFn: createRider,
    onSuccess: async () => {
      setShowCreateManagedUser(false);
      setCreateManagedUserDraft({
        rol: "EMPLEADO",
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        direccion_principal: "",
        contrasena: "",
        licencia: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const updateManagedUser = useMutation({
    mutationFn: updateUser,
    onSuccess: async () => {
      setEditingManagedUserId(null);
      setEditManagedUserDraft({
        nombre: "",
        apellido: "",
        email: "",
        telefono: "",
        direccion_principal: "",
        licencia: "",
        rol: "",
      });
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const deactivateManagedUser = useMutation({
    mutationFn: deactivateUser,
    onSuccess: async () => {
      setConfirmDeactivateManagedUserId(null);
      setConfirmReactivateManagedUserId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  const reactivateManagedUser = useMutation({
    mutationFn: reactivateUser,
    onSuccess: async () => {
      setConfirmReactivateManagedUserId(null);
      setConfirmDeactivateManagedUserId(null);
      await qc.invalidateQueries({ queryKey: ["admin", "users"] });
      await qc.invalidateQueries({ queryKey: ["admin", "audit"] });
    },
  });

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <section className="card">
      <div className="card-body">
        <div className="d-flex align-items-start align-items-md-center justify-content-between flex-column flex-md-row gap-2 mb-3">
          <div>
            <h4 className="mb-1">Gestión de Usuarios</h4>
            <div className="text-muted small">Crear, editar, activar o desactivar empleados y repartidores.</div>
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowCreateManagedUser(v => !v)}>
            {showCreateManagedUser ? "Cerrar" : "Nuevo usuario"}
          </button>
        </div>

        {managedUsersError ? <div className="alert alert-danger">{getErrorMessage(managedUsersError)}</div> : null}

        {/* ── Filtros ─────────────────────────────────────────── */}
        <form
          className="row g-2 align-items-end mb-3"
          onSubmit={e => {
            e.preventDefault();
            setUsersApplied({ ...usersDraft });
            setUsersPage(1);
          }}
        >
          <div className="col-sm-6 col-md-4">
            <label className="form-label" htmlFor="users-search">
              Buscar
            </label>
            <input
              id="users-search"
              type="search"
              className="form-control form-control-sm"
              placeholder="Nombre, email, teléfono o ID"
              value={usersDraft.search}
              onChange={e => setUsersDraft(s => ({ ...s, search: e.target.value }))}
            />
          </div>
          <div className="col-sm-6 col-md-2">
            <label className="form-label" htmlFor="users-role">
              Rol
            </label>
            <select
              id="users-role"
              className="form-select form-select-sm"
              value={usersDraft.rol}
              onChange={e => setUsersDraft(s => ({ ...s, rol: normalizeManagedUserRole(e.target.value) }))}
            >
              <option value="">Todos</option>
              <option value="CLIENTE">Cliente</option>
              <option value="EMPLEADO">Empleado</option>
              <option value="REPARTIDOR">Repartidor</option>
            </select>
          </div>
          <div className="col-sm-6 col-md-2">
            <label className="form-label" htmlFor="users-state">
              Estado
            </label>
            <select
              id="users-state"
              className="form-select form-select-sm"
              value={usersDraft.estado}
              onChange={e => setUsersDraft(s => ({ ...s, estado: normalizeManagedUserState(e.target.value) }))}
            >
              <option value="">Todos</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
          </div>
          <div className="col-sm-6 col-md-2">
            <label className="form-label" htmlFor="users-page-size">
              Filas
            </label>
            <select
              id="users-page-size"
              className="form-select form-select-sm"
              value={usersDraft.pageSize}
              onChange={e => setUsersDraft(s => ({ ...s, pageSize: e.target.value }))}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
          <div className="col-sm-6 col-md-2 d-flex gap-2">
            <button type="submit" className="btn btn-sm btn-primary w-100">
              Aplicar
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary w-100"
              onClick={() => {
                const reset = { search: "", rol: "" as ManagedUserRole, estado: "ACTIVO" as ManagedUserState, pageSize: "20" };
                setUsersDraft(reset);
                setUsersApplied(reset);
                setUsersPage(1);
              }}
            >
              Limpiar
            </button>
          </div>
        </form>

        {/* ── Crear usuario interno ──────────────────────────── */}
        {showCreateManagedUser ? (
          <div className="border rounded p-3 mb-3">
            <div className="fw-semibold mb-2">Crear usuario interno</div>
            {createEmployeeMut.error ? <div className="alert alert-danger py-2 mb-2">{getErrorMessage(createEmployeeMut.error)}</div> : null}
            {createRiderMut.error ? <div className="alert alert-danger py-2 mb-2">{getErrorMessage(createRiderMut.error)}</div> : null}
            <form
              className="row g-2"
              onSubmit={e => {
                e.preventDefault();
                const payload = {
                  nombre: createManagedUserDraft.nombre.trim(),
                  apellido: createManagedUserDraft.apellido.trim(),
                  email: createManagedUserDraft.email.trim(),
                  telefono: createManagedUserDraft.telefono.trim(),
                  direccion_principal: createManagedUserDraft.direccion_principal.trim(),
                  contrasena: createManagedUserDraft.contrasena,
                  licencia: createManagedUserDraft.licencia.trim(),
                };

                if (!payload.nombre || !payload.apellido || !payload.email || !payload.contrasena) return;

                if (createManagedUserDraft.rol === "EMPLEADO") {
                  createEmployeeMut.mutate({
                    nombre: payload.nombre,
                    apellido: payload.apellido,
                    email: payload.email,
                    telefono: payload.telefono,
                    direccion_principal: payload.direccion_principal,
                    contrasena: payload.contrasena,
                  });
                  return;
                }

                if (!payload.licencia) return;
                createRiderMut.mutate(payload);
              }}
            >
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Tipo</label>
                <select
                  className="form-select form-select-sm"
                  value={createManagedUserDraft.rol}
                  onChange={e => {
                    const nextRole = e.target.value === "REPARTIDOR" ? "REPARTIDOR" : "EMPLEADO";
                    setCreateManagedUserDraft(s => ({ ...s, rol: nextRole }));
                  }}
                >
                  <option value="EMPLEADO">Empleado</option>
                  <option value="REPARTIDOR">Repartidor</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Nombre</label>
                <input
                  className="form-control form-control-sm"
                  value={createManagedUserDraft.nombre}
                  required
                  onChange={e => setCreateManagedUserDraft(s => ({ ...s, nombre: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Apellido</label>
                <input
                  className="form-control form-control-sm"
                  value={createManagedUserDraft.apellido}
                  required
                  onChange={e => setCreateManagedUserDraft(s => ({ ...s, apellido: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Email</label>
                <input
                  type="email"
                  className="form-control form-control-sm"
                  value={createManagedUserDraft.email}
                  required
                  onChange={e => setCreateManagedUserDraft(s => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Teléfono</label>
                <input
                  className="form-control form-control-sm"
                  value={createManagedUserDraft.telefono}
                  onChange={e => setCreateManagedUserDraft(s => ({ ...s, telefono: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-5">
                <label className="form-label mb-1">Dirección</label>
                <input
                  className="form-control form-control-sm"
                  value={createManagedUserDraft.direccion_principal}
                  onChange={e => setCreateManagedUserDraft(s => ({ ...s, direccion_principal: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-4">
                <label className="form-label mb-1">Contraseña temporal</label>
                <input
                  type="password"
                  className="form-control form-control-sm"
                  value={createManagedUserDraft.contrasena}
                  required
                  onChange={e => setCreateManagedUserDraft(s => ({ ...s, contrasena: e.target.value }))}
                />
              </div>

              {createManagedUserDraft.rol === "REPARTIDOR" ? (
                <>
                  <div className="col-12 col-md-4">
                    <label className="form-label mb-1">Licencia</label>
                    <input
                      className="form-control form-control-sm"
                      value={createManagedUserDraft.licencia}
                      required
                      onChange={e => setCreateManagedUserDraft(s => ({ ...s, licencia: e.target.value }))}
                    />
                  </div>
                </>
              ) : null}

              <div className="col-12 d-flex gap-2 justify-content-end">
                <button type="submit" className="btn btn-sm btn-primary" disabled={createEmployeeMut.isPending || createRiderMut.isPending}>
                  {createEmployeeMut.isPending || createRiderMut.isPending ? "Guardando..." : "Crear"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={createEmployeeMut.isPending || createRiderMut.isPending}
                  onClick={() => {
                    setShowCreateManagedUser(false);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* ── Editar usuario ─────────────────────────────────── */}
        {editingManagedUserId ? (
          <div className="border rounded p-3 mb-3">
            <div className="fw-semibold mb-2">Editar usuario #{editingManagedUserId}</div>
            {updateManagedUser.error ? <div className="alert alert-danger py-2 mb-2">{getErrorMessage(updateManagedUser.error)}</div> : null}
            <form
              className="row g-2"
              onSubmit={e => {
                e.preventDefault();
                if (!editingManagedUserId) return;
                updateManagedUser.mutate({
                  id_usuario: editingManagedUserId,
                  nombre: editManagedUserDraft.nombre.trim(),
                  apellido: editManagedUserDraft.apellido.trim(),
                  email: editManagedUserDraft.email.trim(),
                  telefono: editManagedUserDraft.telefono.trim(),
                  direccion_principal: editManagedUserDraft.direccion_principal.trim(),
                  licencia: editManagedUserDraft.licencia.trim(),
                  rol: editManagedUserDraft.rol,
                });
              }}
            >
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Tipo de usuario</label>
                <select
                  className="form-select form-select-sm"
                  value={editManagedUserDraft.rol}
                  onChange={e => {
                    const next = e.target.value === "REPARTIDOR" ? "REPARTIDOR" : "EMPLEADO";
                    setEditManagedUserDraft(s => ({ ...s, rol: next as ManagedUserRole }));
                  }}
                >
                  <option value="EMPLEADO">Empleado</option>
                  <option value="REPARTIDOR">Repartidor</option>
                </select>
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Nombre</label>
                <input
                  className="form-control form-control-sm"
                  value={editManagedUserDraft.nombre}
                  required
                  onChange={e => setEditManagedUserDraft(s => ({ ...s, nombre: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Apellido</label>
                <input
                  className="form-control form-control-sm"
                  value={editManagedUserDraft.apellido}
                  required
                  onChange={e => setEditManagedUserDraft(s => ({ ...s, apellido: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Email</label>
                <input
                  type="email"
                  className="form-control form-control-sm"
                  value={editManagedUserDraft.email}
                  required
                  onChange={e => setEditManagedUserDraft(s => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-3">
                <label className="form-label mb-1">Teléfono</label>
                <input
                  className="form-control form-control-sm"
                  value={editManagedUserDraft.telefono}
                  onChange={e => setEditManagedUserDraft(s => ({ ...s, telefono: e.target.value }))}
                />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label mb-1">Dirección</label>
                <input
                  className="form-control form-control-sm"
                  value={editManagedUserDraft.direccion_principal}
                  onChange={e => setEditManagedUserDraft(s => ({ ...s, direccion_principal: e.target.value }))}
                />
              </div>

              {editManagedUserDraft.rol === "REPARTIDOR" ? (
                <>
                  <div className="col-12 col-md-3">
                    <label className="form-label mb-1">Licencia</label>
                    <input
                      className="form-control form-control-sm"
                      value={editManagedUserDraft.licencia}
                      required
                      onChange={e => setEditManagedUserDraft(s => ({ ...s, licencia: e.target.value }))}
                    />
                  </div>
                </>
              ) : null}

              <div className="col-12 d-flex gap-2 justify-content-end">
                <button type="submit" className="btn btn-sm btn-primary" disabled={updateManagedUser.isPending}>
                  {updateManagedUser.isPending ? "Guardando..." : "Guardar"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={updateManagedUser.isPending}
                  onClick={() => {
                    setEditingManagedUserId(null);
                    setEditManagedUserDraft({
                      nombre: "",
                      apellido: "",
                      email: "",
                      telefono: "",
                      direccion_principal: "",
                      licencia: "",
                      rol: "",
                    });
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {/* ── Tabla ───────────────────────────────────────────── */}
        {managedUsersLoading ? <div className="text-muted">Cargando...</div> : null}

        {!managedUsersLoading && managedUsersPaginated && managedUsersPaginated.rows.length === 0 ? (
          <div className="alert alert-info mb-0">Sin usuarios para los filtros actuales.</div>
        ) : null}

        {!managedUsersLoading && managedUsersPaginated && managedUsersPaginated.rows.length > 0 ? (
          <>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th>Teléfono</th>
                    <th>Datos de reparto</th>
                    <th>Registro</th>
                    <th className="text-end">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {managedUsersPaginated.rows.map(r => {
                    const canMutate = r.rol === "EMPLEADO" || r.rol === "REPARTIDOR";
                    const isConfirmingDeactivate = confirmDeactivateManagedUserId === r.id_usuario;
                    const isConfirmingReactivate = confirmReactivateManagedUserId === r.id_usuario;
                    const isInactive = r.estado === "INACTIVO";
                    return (
                      <tr key={r.id_usuario}>
                        <td className="fw-semibold">#{r.id_usuario}</td>
                        <td>
                          <div className="fw-semibold">{`${r.nombre} ${r.apellido}`.trim()}</div>
                          <div className="text-muted small">{r.email}</div>
                        </td>
                        <td>
                          <span
                            className={`badge ${r.rol === "CLIENTE" ? "text-bg-light" : r.rol === "EMPLEADO" ? "text-bg-primary" : "text-bg-info"}`}
                          >
                            {getManagedUserRoleLabel(r.rol)}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${r.estado === "ACTIVO" ? "text-bg-success" : "text-bg-secondary"}`}>
                            {formatStateLabel(r.estado)}
                          </span>
                        </td>
                        <td>{r.telefono || "—"}</td>
                        <td>{r.rol === "REPARTIDOR" ? r.licencia || (r.id_motorizado ? `Motorizado #${r.id_motorizado}` : "Sin vínculo") : "—"}</td>
                        <td className="text-nowrap">
                          {(() => {
                            const dt = formatDateTime(r.fecha_registro, "datetime");
                            if (!dt) return "—";
                            return (
                              <div title={dt.raw}>
                                <div className="fw-semibold">{dt.date}</div>
                                <div className="text-muted small">{dt.time}</div>
                              </div>
                            );
                          })()}
                        </td>
                        <td className="text-end">
                          {!canMutate ? <span className="text-muted small">Solo lectura</span> : null}
                          {canMutate && !isConfirmingDeactivate && !isConfirmingReactivate ? (
                            <div className="d-flex gap-2 justify-content-end flex-wrap">
                              <button
                                type="button"
                                className="btn btn-sm btn-outline-secondary"
                                onClick={() => {
                                  setEditingManagedUserId(r.id_usuario);
                                  setEditManagedUserDraft({
                                    nombre: r.nombre || "",
                                    apellido: r.apellido || "",
                                    email: r.email || "",
                                    telefono: r.telefono || "",
                                    direccion_principal: r.direccion_principal || "",
                                    licencia: r.licencia || "",
                                    rol: r.rol,
                                  });
                                  setConfirmDeactivateManagedUserId(null);
                                  setConfirmReactivateManagedUserId(null);
                                }}
                              >
                                Editar
                              </button>
                              {isInactive ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-success"
                                  disabled={reactivateManagedUser.isPending}
                                  onClick={() => {
                                    setConfirmDeactivateManagedUserId(null);
                                    setConfirmReactivateManagedUserId(r.id_usuario);
                                  }}
                                >
                                  Reactivar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-danger"
                                  disabled={deactivateManagedUser.isPending}
                                  onClick={() => {
                                    setConfirmReactivateManagedUserId(null);
                                    setConfirmDeactivateManagedUserId(r.id_usuario);
                                  }}
                                >
                                  Desactivar
                                </button>
                              )}
                            </div>
                          ) : null}

                          {isConfirmingDeactivate ? (
                            <div className="d-flex flex-column align-items-end gap-2">
                              <div className="small text-muted">¿Desactivar usuario #{r.id_usuario}?</div>
                              <div className="d-flex gap-2 justify-content-end flex-wrap">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger"
                                  disabled={deactivateManagedUser.isPending}
                                  onClick={() => deactivateManagedUser.mutate(r.id_usuario)}
                                >
                                  {deactivateManagedUser.isPending ? "Procesando..." : "Confirmar"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  disabled={deactivateManagedUser.isPending}
                                  onClick={() => setConfirmDeactivateManagedUserId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {isConfirmingReactivate ? (
                            <div className="d-flex flex-column align-items-end gap-2">
                              <div className="small text-muted">¿Reactivar usuario #{r.id_usuario}?</div>
                              {r.rol === "REPARTIDOR" ? (
                                <div className="small text-muted text-end" style={{ maxWidth: 280 }}>
                                  Si el repartidor no quedó vinculado a un motorizado operativo, revísalo desde Editar antes de asignarle pedidos.
                                </div>
                              ) : null}
                              <div className="d-flex gap-2 justify-content-end flex-wrap">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-success"
                                  disabled={reactivateManagedUser.isPending}
                                  onClick={() => reactivateManagedUser.mutate(r.id_usuario)}
                                >
                                  {reactivateManagedUser.isPending ? "Procesando..." : "Confirmar"}
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  disabled={reactivateManagedUser.isPending}
                                  onClick={() => setConfirmReactivateManagedUserId(null)}
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="d-flex justify-content-between align-items-center mt-3 gap-2 flex-wrap">
              <div className="small text-muted">
                Página {managedUsersPaginated.page} de {managedUsersPaginated.totalPages} · {managedUsersPaginated.total} registros
              </div>
              <div className="btn-group btn-group-sm" role="group" aria-label="Paginación usuarios admin">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={managedUsersPaginated.page <= 1 || managedUsersLoading}
                  onClick={() => setUsersPage(p => Math.max(p - 1, 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={managedUsersPaginated.page >= managedUsersPaginated.totalPages || managedUsersLoading}
                  onClick={() => setUsersPage(p => Math.min(p + 1, managedUsersPaginated.totalPages))}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
