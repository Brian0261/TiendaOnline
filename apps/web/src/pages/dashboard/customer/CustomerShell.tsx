import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../auth/useAuth";
import { fetchProfile, updateProfile } from "../shared/services/customerService";
import type { Profile, ProfileFormValues } from "../shared/types/customer.types";

import { ProfileForm } from "./sections/ProfileSection";
import { OrdersSection } from "./sections/OrdersSection";

export function CustomerShell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { logout, user: authUser } = useAuth();
  const [params, setParams] = useSearchParams();

  const tabParam = params.get("tab") || "profile";
  const tab: "profile" | "orders" = tabParam === "orders" ? "orders" : "profile";

  const { data: profileData } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchProfile,
  });

  const profile = useMemo<Profile | undefined>(() => {
    const fromApi = profileData?.user;
    if (!fromApi && !authUser) return undefined;

    const safeFromApi = fromApi || ({} as Partial<Profile>);
    const safeAuthUser = authUser || {};

    return {
      id_usuario: Number(safeFromApi.id_usuario || safeAuthUser.id_usuario || 0),
      nombre: String(safeFromApi.nombre || safeAuthUser.nombre || ""),
      apellido: String(safeFromApi.apellido || safeAuthUser.apellido || ""),
      email: String(safeFromApi.email || safeAuthUser.email || ""),
      telefono: String(safeFromApi.telefono || ""),
      direccion_principal: String(safeFromApi.direccion_principal || ""),
      rol: safeFromApi.rol || safeAuthUser.rol,
    };
  }, [authUser, profileData?.user]);

  const firstName = useMemo(() => {
    const n = (profile?.nombre || "Cliente").trim();
    return n.split(" ")[0] || "Cliente";
  }, [profile?.nombre]);

  const initialForm = useMemo<ProfileFormValues>(() => {
    return {
      nombre: profile?.nombre || "",
      apellido: profile?.apellido || "",
      email: profile?.email || "",
      telefono: profile?.telefono || "",
      direccion_principal: profile?.direccion_principal || "",
    };
  }, [profile?.nombre, profile?.apellido, profile?.email, profile?.telefono, profile?.direccion_principal]);

  const updateProfileMut = useMutation({
    mutationFn: updateProfile,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  return (
    <main className="container py-4 dashboard-container">
      <header className="dash-header mb-3">
        <h1 className="mb-1">
          Hola, <span id="cliente-nombre">{firstName}</span>
        </h1>
        <div className="dash-subtitle">Gestiona tus datos y revisa tus compras</div>
      </header>

      <nav className="nav-dashboard mb-4">
        <a
          href="#"
          className={`nav-link ${tab === "profile" ? "active" : ""}`}
          id="tab-profile"
          onClick={e => {
            e.preventDefault();
            setParams({ tab: "profile" }, { replace: true });
          }}
        >
          <i className="fa fa-user-circle"></i> Datos personales
        </a>
        <a
          href="#"
          className={`nav-link ${tab === "orders" ? "active" : ""}`}
          id="tab-orders"
          onClick={e => {
            e.preventDefault();
            setParams({ tab: "orders" }, { replace: true });
          }}
        >
          <i className="fa fa-shopping-bag"></i> Mis compras
        </a>
        <a
          href="#"
          className="nav-link text-danger ms-auto"
          id="logout-btn"
          onClick={e => {
            e.preventDefault();
            logout();
            nav("/", { replace: true });
          }}
        >
          <i className="fa fa-sign-out-alt"></i> Cerrar sesión
        </a>
      </nav>

      {/* DATOS PERSONALES */}
      <section id="section-profile" style={{ display: tab === "profile" ? "block" : "none" }}>
        <div className="card card-soft mb-4">
          <div className="card-body">
            <h5 className="card-title">Datos personales</h5>
            <ProfileForm
              key={`${profile?.id_usuario || "u"}:${profile?.nombre || ""}:${profile?.apellido || ""}:${profile?.email || ""}:${
                profile?.telefono || ""
              }:${profile?.direccion_principal || ""}`}
              initial={initialForm}
              isPending={updateProfileMut.isPending}
              onSubmit={values => updateProfileMut.mutate(values)}
            />
          </div>
        </div>
      </section>

      {/* MIS COMPRAS */}
      <OrdersSection visible={tab === "orders"} />
    </main>
  );
}
