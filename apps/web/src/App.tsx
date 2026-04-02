import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";
import { CatalogPage } from "./pages/products/CatalogPage";
import { ProductDetailPage } from "./pages/products/ProductDetailPage";
import { CartPage } from "./pages/cart/CartPage";
import { CheckoutPage } from "./pages/cart/CheckoutPage";
const AdminDashboardPage = lazy(() => import("./pages/dashboard/AdminDashboardPage").then(m => ({ default: m.AdminDashboardPage })));
const CustomerDashboardPage = lazy(() => import("./pages/dashboard/CustomerDashboardPage").then(m => ({ default: m.CustomerDashboardPage })));
const EmployeeDashboardPage = lazy(() => import("./pages/dashboard/EmployeeDashboardPage").then(m => ({ default: m.EmployeeDashboardPage })));
const DeliveryDashboardPage = lazy(() => import("./pages/dashboard/DeliveryDashboardPage").then(m => ({ default: m.DeliveryDashboardPage })));
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireRole } from "./auth/RequireRole";
import { RegisterPage } from "./pages/auth/RegisterPage.tsx";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { BackofficeLoginPage } from "./pages/auth/BackofficeLoginPage";
import { AppLayout } from "./layout/AppLayout";
import { isBackofficeHost } from "./utils/host";

function App() {
  const isInternalHost = isBackofficeHost();

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={isInternalHost ? <BackofficeLoginPage /> : <Navigate to="/?login=1" replace />} />
        <Route path="/backoffice/login" element={isInternalHost ? <Navigate to="/login" replace /> : <BackofficeLoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/about" element={<AboutPage />} />

        <Route path="/products" element={<CatalogPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />

        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />

        <Route
          path="/dashboard/admin"
          element={
            <RequireRole role="ADMINISTRADOR">
              <Suspense fallback={<div className="text-center p-5">Cargando...</div>}>
                <AdminDashboardPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/customer"
          element={
            <RequireRole role="CLIENTE">
              <Suspense fallback={<div className="text-center p-5">Cargando...</div>}>
                <CustomerDashboardPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/employee"
          element={
            <RequireRole role="EMPLEADO">
              <Suspense fallback={<div className="text-center p-5">Cargando...</div>}>
                <EmployeeDashboardPage />
              </Suspense>
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/delivery"
          element={
            <RequireRole role="REPARTIDOR">
              <Suspense fallback={<div className="text-center p-5">Cargando...</div>}>
                <DeliveryDashboardPage />
              </Suspense>
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
