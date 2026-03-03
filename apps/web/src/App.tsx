import { Routes, Route, Navigate } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AboutPage } from "./pages/AboutPage";
import { CatalogPage } from "./pages/products/CatalogPage";
import { ProductDetailPage } from "./pages/products/ProductDetailPage";
import { CartPage } from "./pages/cart/CartPage";
import { CheckoutPage } from "./pages/cart/CheckoutPage";
import { AdminDashboardPage } from "./pages/dashboard/AdminDashboardPage";
import { CustomerDashboardPage } from "./pages/dashboard/CustomerDashboardPage";
import { EmployeeDashboardPage } from "./pages/dashboard/EmployeeDashboardPage";
import { DeliveryDashboardPage } from "./pages/dashboard/DeliveryDashboardPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { RequireRole } from "./auth/RequireRole";
import { RegisterPage } from "./pages/auth/RegisterPage.tsx";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { BackofficeLoginPage } from "./pages/auth/BackofficeLoginPage";
import { AppLayout } from "./layout/AppLayout";

function App() {
  const isBackofficeHost = typeof window !== "undefined" && window.location.hostname === "backoffice.minimarketexpress.shop";

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={isBackofficeHost ? <BackofficeLoginPage /> : <Navigate to="/?login=1" replace />} />
        <Route path="/backoffice/login" element={isBackofficeHost ? <Navigate to="/login" replace /> : <BackofficeLoginPage />} />
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
              <AdminDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/customer"
          element={
            <RequireRole role="CLIENTE">
              <CustomerDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/employee"
          element={
            <RequireRole role="EMPLEADO">
              <EmployeeDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/dashboard/delivery"
          element={
            <RequireRole role="REPARTIDOR">
              <DeliveryDashboardPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default App;
