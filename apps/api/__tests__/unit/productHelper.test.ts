// backend/__tests__/unit/productHelper.test.js

// 1. Extraemos la función a probar (simulando que la exportaste o copiándola aquí para el test)
// Nota: Para que esto funcione directo, asegúrate de exportar 'normalizeImage' en tu productController.js
// Si no quieres modificar el controller, usa esta versión local para validar la lógica:
const normalizeImage = raw => {
  if (!raw) return "/assets/images/placeholder-product.png";
  if (typeof raw !== "string") return "/assets/images/placeholder-product.png";
  if (raw.startsWith("http")) return raw;
  if (/^\/?api\/uploads\//i.test(raw.trim())) {
    const t = raw.trim();
    return t.startsWith("/") ? t : `/${t}`;
  }

  let cleaned = raw
    .trim()
    .replace(/^\/?views\/products\//, "")
    .replace(/^\/?assets\//, "assets/");

  if (!/^assets\/images\//.test(cleaned)) {
    if (/^images\//.test(cleaned)) cleaned = `assets/${cleaned}`;
    if (!/^assets\/images\//.test(cleaned)) cleaned = `assets/images/${cleaned}`;
  }

  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
};

describe("Pruebas Unitarias - Normalizador de Imágenes", () => {
  test("Debe retornar placeholder si la imagen es nula", () => {
    const resultado = normalizeImage(null);
    expect(resultado).toBe("/assets/images/placeholder-product.png");
  });

  test("Debe mantener URLs absolutas (http)", () => {
    const url = "http://cloudinary.com/foto.jpg";
    expect(normalizeImage(url)).toBe(url);
  });

  test("Debe corregir rutas relativas simples agregando la carpeta assets", () => {
    const input = "lays-clasica.png";
    const esperado = "/assets/images/lays-clasica.png";
    expect(normalizeImage(input)).toBe(esperado);
  });

  test("Debe limpiar prefijos antiguos (/views/products/)", () => {
    const input = "/views/products/coca-cola.jpg";
    const esperado = "/assets/images/coca-cola.jpg";
    expect(normalizeImage(input)).toBe(esperado);
  });

  test("Debe respetar rutas del backend (/api/uploads/...)", () => {
    const input = "/api/uploads/images/demo.webp";
    expect(normalizeImage(input)).toBe("/api/uploads/images/demo.webp");
  });
});
export {};
