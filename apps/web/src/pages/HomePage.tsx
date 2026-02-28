import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { normalizeImageUrl, PLACEHOLDER_PRODUCT } from "../shared/image";
import { api } from "../api/http";

type Product = {
  id: number;
  nombre: string;
  descripcion?: string;
  precio: number;
  imagen?: string;
};

export function HomePage() {
  const { data } = useQuery({
    queryKey: ["products", "featured"],
    queryFn: () => api.get<Product[]>("/products"),
  });

  const featured = (data || []).slice(0, 8);

  return (
    <div>
      <section className="hero-section hero-section--home text-white">
        <div className="container hero-content py-5">
          <div className="row align-items-center">
            <div className="col-lg-7 text-center text-lg-start">
              <h1 className="display-5 fw-bold mb-3 mb-lg-4 text-overlay">Los mejores productos para tu hogar</h1>
              <p className="lead mb-4 text-overlay">Encuentra todo lo que necesitas a precios de bodega con la comodidad de comprar desde casa.</p>
              <div className="d-flex flex-column flex-sm-row gap-3 justify-content-center justify-content-lg-start">
                <Link to="/products" className="btn btn-light btn-lg px-4 py-2 fw-bold">
                  Ver Catálogo
                </Link>
                <Link to="/register" className="btn btn-outline-light btn-lg px-4 py-2 fw-bold">
                  Regístrate Gratis
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-5 bg-light">
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="fw-bold">Explora Nuestras Categorías</h2>
            <p className="text-muted">Encuentra lo que necesitas organizado por categorías</p>
          </div>
          <div className="row g-4">
            <div className="col-6 col-md-3">
              <Link to="/products" className="text-decoration-none">
                <div className="category-card card h-100 text-center p-4 border-0 shadow-sm">
                  <div className="category-icon mb-3">
                    <i className="fas fa-shopping-basket"></i>
                  </div>
                  <h3 className="h5 mb-1">Abarrotes</h3>
                  <p className="text-muted mb-0">Arroz, aceite, fideos y más</p>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link to="/products" className="text-decoration-none">
                <div className="category-card card h-100 text-center p-4 border-0 shadow-sm">
                  <div className="category-icon mb-3">
                    <i className="fas fa-wine-bottle"></i>
                  </div>
                  <h3 className="h5 mb-1">Bebidas</h3>
                  <p className="text-muted mb-0">Refrescos, jugos y licores</p>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link to="/products" className="text-decoration-none">
                <div className="category-card card h-100 text-center p-4 border-0 shadow-sm">
                  <div className="category-icon mb-3">
                    <i className="fas fa-cheese"></i>
                  </div>
                  <h3 className="h5 mb-1">Lácteos</h3>
                  <p className="text-muted mb-0">Leche, yogurt, queso y más</p>
                </div>
              </Link>
            </div>
            <div className="col-6 col-md-3">
              <Link to="/products" className="text-decoration-none">
                <div className="category-card card h-100 text-center p-4 border-0 shadow-sm">
                  <div className="category-icon mb-3">
                    <i className="fas fa-cookie"></i>
                  </div>
                  <h3 className="h5 mb-1">Snacks</h3>
                  <p className="text-muted mb-0">Galletas, chocolates y más</p>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-5">
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="fw-bold">Productos Destacados</h2>
            <p className="text-muted">Los productos más populares de nuestra bodega</p>
          </div>
          <div className="row g-4">
            {featured.map(p => (
              <div className="col-12 col-sm-6 col-md-4 col-lg-3" key={p.id}>
                <div className="product-card card h-100 border-0 shadow-sm">
                  <Link to={`/products/${p.id}`} className="text-decoration-none text-dark">
                    <div className="ratio ratio-1x1 bg-light">
                      <img
                        src={normalizeImageUrl(p.imagen)}
                        className="product-img"
                        alt={p.nombre}
                        loading="lazy"
                        onError={e => {
                          (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_PRODUCT;
                        }}
                      />
                    </div>
                    <div className="card-body">
                      <h6 className="mb-1 product-title">{p.nombre}</h6>
                      <div className="text-muted fw-semibold">S/ {Number(p.precio ?? 0).toFixed(2)}</div>
                    </div>
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-4">
            <Link to="/products" className="btn btn-danger btn-lg px-4">
              Ver todos los productos
            </Link>
          </div>
        </div>
      </section>

      <section className="py-5 bg-light">
        <div className="container">
          <div className="text-center mb-5">
            <h2 className="fw-bold">¿Por qué elegir Minimarket Express?</h2>
            <p className="text-muted">Las razones para comprar con nosotros</p>
          </div>
          <div className="row g-4">
            <div className="col-md-4">
              <div className="feature-box card border-0 shadow-sm h-100">
                <div className="card-body text-center p-4">
                  <div className="feature-icon mb-3">
                    <i className="fas fa-truck"></i>
                  </div>
                  <h3 className="h5 fw-bold mb-2">Envío Rápido</h3>
                  <p className="text-muted">Recibe tus productos en menos de 24 horas en tu domicilio.</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="feature-box card border-0 shadow-sm h-100">
                <div className="card-body text-center p-4">
                  <div className="feature-icon mb-3">
                    <i className="fas fa-tag"></i>
                  </div>
                  <h3 className="h5 fw-bold mb-2">Precios de Bodega</h3>
                  <p className="text-muted">Los mejores precios directos de nuestra bodega a tu casa.</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="feature-box card border-0 shadow-sm h-100">
                <div className="card-body text-center p-4">
                  <div className="feature-icon mb-3">
                    <i className="fas fa-shield-alt"></i>
                  </div>
                  <h3 className="h5 fw-bold mb-2">Pago Seguro</h3>
                  <p className="text-muted">Múltiples métodos de pago con total seguridad.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-5 bg-danger text-white">
        <div className="container text-center">
          <h2 className="fw-bold mb-4">¿Aún no tienes una cuenta?</h2>
          <p className="lead mb-4">Regístrate ahora y obtén acceso a ofertas exclusivas y descuentos especiales.</p>
          <Link to="/register" className="btn btn-light btn-lg px-4 fw-bold">
            Regístrate Gratis
          </Link>
        </div>
      </section>
    </div>
  );
}
