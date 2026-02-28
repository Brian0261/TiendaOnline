// backend/models/Product.js
// ────────────────────────────────────────────────────────────
//  Modelo PRODUCTO – operaciones SQL centralizadas.
//  Soporta: alta, edición, desactivación (borrado lógico),
//  re-activación y eliminación definitiva (hard delete).
// ────────────────────────────────────────────────────────────
const { poolPromise } = require("../config/db.config");
const { PLACEHOLDER_PRODUCT } = require("../shared/image");

const Product = {
  /* =========================================================
     LISTADO (status = active | inactive | all)
     ========================================================= */
  async getAllProducts({ status = "active", category = null, search = "" } = {} as any) {
    const pool = await poolPromise;

    let whereClauses = [];
    if (status === "active") whereClauses.push("p.activo = true");
    else if (status === "inactive") whereClauses.push("p.activo = false");
    // status = all → sin filtro

    // 🔎 Filtro por categoría
    if (category) whereClauses.push("p.id_categoria = $1");
    // 🔎 Filtro por texto (nombre o descripción)
    if (search) whereClauses.push(`(p.nombre_producto ILIKE $${category ? 2 : 1} OR p.descripcion ILIKE $${category ? 2 : 1})`);

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const params = [];
    if (category) params.push(category);
    if (search) params.push(`%${search}%`);

    const { rows } = await pool.query(
      `
        SELECT
          p.id_producto                         AS id,
          p.nombre_producto                     AS name,
          MAX(p.descripcion)                    AS description,
          p.precio                              AS price,
          p.id_categoria                        AS "categoryId",
          c.nombre_categoria                    AS "categoryName",
          p.id_marca                            AS "brandId",
          m.nombre_marca                        AS "brandName",
          COALESCE(SUM(i.cantidad_disponible),0)  AS stock,
          p.imagen                              AS imagen,
          p.activo                              AS active
        FROM producto p
        LEFT JOIN categoria  c ON p.id_categoria = c.id_categoria
        LEFT JOIN marca      m ON p.id_marca     = m.id_marca
        LEFT JOIN inventario i ON p.id_producto  = i.id_producto
        ${where}
        GROUP BY
          p.id_producto, p.nombre_producto, p.precio,
          p.id_categoria, c.nombre_categoria,
          p.id_marca, m.nombre_marca,
          p.imagen, p.activo
        ORDER BY p.id_producto ASC;
      `,
      params,
    );

    return rows || [];
  },

  /* =========================================================
     DETALLE (admin ve activos o inactivos)
     ========================================================= */
  async getProductById(id) {
    const pool = await poolPromise;

    const { rows } = await pool.query(
      `
          SELECT
            p.id_producto                       AS id,
            p.nombre_producto                   AS name,
            MAX(p.descripcion)                  AS description,
            p.precio                            AS price,
            p.id_categoria                      AS "categoryId",
            c.nombre_categoria                  AS "categoryName",
            p.id_marca                          AS "brandId",
            m.nombre_marca                      AS "brandName",
            COALESCE(SUM(i.cantidad_disponible),0) AS stock,
            p.imagen                            AS imagen,
            p.activo                            AS active
          FROM producto p
          LEFT JOIN categoria  c ON p.id_categoria = c.id_categoria
          LEFT JOIN marca      m ON p.id_marca     = m.id_marca
          LEFT JOIN inventario i ON p.id_producto  = i.id_producto
          WHERE p.id_producto = $1
          GROUP BY
            p.id_producto, p.nombre_producto, p.precio,
            p.id_categoria, c.nombre_categoria,
            p.id_marca, m.nombre_marca,
            p.imagen, p.activo;
        `,
      [id],
    );

    return rows[0];
  },

  /* =========================================================
     CREAR + stock inicial
     ========================================================= */
  async createProduct({ name, description = null, price, categoryId, brandId, stock = 0, imagePath = PLACEHOLDER_PRODUCT, almacenId = 1 }) {
    const pool = await poolPromise;
    const tx = await pool.connect();

    await tx.query("BEGIN");
    try {
      /* 1️⃣ Producto */
      const { rows } = await tx.query(
        `
          INSERT INTO producto
            (nombre_producto, descripcion, precio, imagen,
             id_categoria, id_marca, activo)
          VALUES ($1, $2, $3, $4, $5, $6, true)
          RETURNING id_producto AS "newId";
        `,
        [name, description, price, imagePath, categoryId, brandId],
      );

      const newId = rows[0].newId;

      /* 2️⃣ Stock */
      await tx.query(
        `
          INSERT INTO inventario
            (cantidad_disponible, id_producto, id_almacen)
          VALUES ($1, $2, $3);
        `,
        [stock, newId, almacenId],
      );

      await tx.query("COMMIT");
      return newId;
    } catch (err) {
      await tx.query("ROLLBACK");
      throw new Error("Error al crear producto: " + err.message);
    } finally {
      tx.release();
    }
  },

  /* =========================================================
     ACTUALIZAR
     ========================================================= */
  async updateProduct(id, { name, description, price, categoryId, brandId, imagePath }) {
    const pool = await poolPromise;

    const sqlUpdate = `
      UPDATE producto
      SET  nombre_producto = $1,
           descripcion     = $2,
           precio          = $3,
           id_categoria    = $4,
           id_marca        = $5
           ${imagePath ? ", imagen = $6" : ""}
      WHERE id_producto = $${imagePath ? 7 : 6};
    `;

    const params = [name, description, price, categoryId, brandId];
    if (imagePath) params.push(imagePath);
    params.push(id);

    await pool.query(sqlUpdate, params);
    return true;
  },

  /* =========================================================
     DESACTIVAR (soft delete)
     ========================================================= */
  async deactivateProduct(id) {
    const pool = await poolPromise;
    await pool.query("UPDATE producto SET activo = false WHERE id_producto = $1;", [id]);
    return true;
  },

  /* =========================================================
     ACTIVAR nuevamente
     ========================================================= */
  async activateProduct(id) {
    const pool = await poolPromise;
    await pool.query("UPDATE producto SET activo = true WHERE id_producto = $1;", [id]);
    return true;
  },

  /* =========================================================
     ELIMINAR DEFINITIVO (hard delete)
     ========================================================= */
  async hardDeleteProduct(id) {
    const pool = await poolPromise;
    const tx = await pool.connect();
    await tx.query("BEGIN");
    try {
      /* eliminar dependencias directas */
      await tx.query("DELETE FROM inventario WHERE id_producto = $1;", [id]);
      /* …agrega otras tablas hijas si fuera necesario… */

      /* finalmente el propio producto */
      await tx.query("DELETE FROM producto WHERE id_producto = $1;", [id]);

      await tx.query("COMMIT");
      return true;
    } catch (err) {
      await tx.query("ROLLBACK");
      throw new Error("Error en hard delete: " + err.message);
    } finally {
      tx.release();
    }
  },
};

module.exports = Product;

export {};
