import { useState } from "react";
import type { ProfileFormValues } from "../../shared/types/customer.types";

export function ProfileForm({
  initial,
  onSubmit,
  isPending,
}: {
  initial: ProfileFormValues;
  onSubmit: (values: ProfileFormValues) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<ProfileFormValues>(initial);

  return (
    <form
      id="profile-form"
      className="row gy-3"
      onSubmit={e => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      <div className="col-md-6">
        <label htmlFor="pf-nombre" className="form-label">
          Nombre
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-nombre"
          name="nombre"
          required
          value={form.nombre}
          onChange={e => setForm(s => ({ ...s, nombre: e.target.value }))}
        />
      </div>
      <div className="col-md-6">
        <label htmlFor="pf-apellido" className="form-label">
          Apellido
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-apellido"
          name="apellido"
          required
          value={form.apellido}
          onChange={e => setForm(s => ({ ...s, apellido: e.target.value }))}
        />
      </div>
      <div className="col-md-6">
        <label htmlFor="pf-email" className="form-label">
          Correo electrónico
        </label>
        <input type="email" className="form-control" id="pf-email" name="email" readOnly value={form.email} />
      </div>
      <div className="col-md-6">
        <label htmlFor="pf-telefono" className="form-label">
          Teléfono
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-telefono"
          name="telefono"
          value={form.telefono}
          onChange={e => setForm(s => ({ ...s, telefono: e.target.value }))}
        />
      </div>
      <div className="col-12">
        <label htmlFor="pf-direccion" className="form-label">
          Dirección principal
        </label>
        <input
          type="text"
          className="form-control"
          id="pf-direccion"
          name="direccion_principal"
          value={form.direccion_principal}
          onChange={e => setForm(s => ({ ...s, direccion_principal: e.target.value }))}
        />
      </div>
      <div className="col-12 text-end">
        <button type="submit" className="btn btn-primary" disabled={isPending}>
          {isPending ? "Actualizando..." : "Actualizar datos"}
        </button>
      </div>
    </form>
  );
}
