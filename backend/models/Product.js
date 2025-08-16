// backend/models/Product.js
// ────────────────────────────────────────────────────────────
//  Modelo PRODUCTO – operaciones SQL centralizadas.
//  Soporta: alta, edición, desactivación (borrado lógico),
//  re-activación y eliminación definitiva (hard delete).
// ────────────────────────────────────────────────────────────
const { sql, poolPromise } = require("../config/db.config");

const Product = {
  /* =========================================================
     LISTADO (status = active | inactive | all)
     ========================================================= */
  async getAllProducts({ status = "active", category, search } = {}) {
    const pool = await poolPromise;

    let whereClauses = [];
    if (status === "active") whereClauses.push("P.activo = 1");
    else if (status === "inactive") whereClauses.push("P.activo = 0");
    // status = all → sin filtro

    // 🔎 Filtro por categoría
    if (category) whereClauses.push("P.id_categoria = @catId");
    // 🔎 Filtro por texto (nombre o descripción)
    if (search) whereClauses.push("(P.nombre_producto LIKE @q OR P.descripcion LIKE @q)");

    const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const req = pool.request();
    if (category) req.input("catId", sql.Int, category);
    if (search) req.input("q", sql.VarChar, `%${search}%`);

    const { recordset } = await req.query(`
      SELECT
        P.id_producto                         AS id,
        P.nombre_producto                     AS name,
        MAX(CAST(P.descripcion AS NVARCHAR))  AS description,
        P.precio                              AS price,
        P.id_categoria                        AS categoryId,
        C.nombre_categoria                    AS categoryName,
        P.id_marca                            AS brandId,
        M.nombre_marca                        AS brandName,
        ISNULL(SUM(I.cantidad_disponible),0)  AS stock,
        '/' + P.imagen                        AS image,
        P.activo                              AS active
      FROM PRODUCTO P
      LEFT JOIN CATEGORIA  C ON P.id_categoria = C.id_categoria
      LEFT JOIN MARCA      M ON P.id_marca     = M.id_marca
      LEFT JOIN INVENTARIO I ON P.id_producto  = I.id_producto
      ${where}
      GROUP BY
        P.id_producto, P.nombre_producto, P.precio,
        P.id_categoria, C.nombre_categoria,
        P.id_marca, M.nombre_marca,
        P.imagen, P.activo
      ORDER BY P.id_producto ASC;
    `);

    return recordset;
  },

  /* =========================================================
     DETALLE (admin ve activos o inactivos)
     ========================================================= */
  async getProductById(id) {
    const pool = await poolPromise;

    const { recordset } = await pool.request().input("id", sql.Int, id).query(`
        SELECT
          P.id_producto                       AS id,
          P.nombre_producto                   AS name,
          MAX(CAST(P.descripcion AS NVARCHAR)) AS description,
          P.precio                            AS price,
          P.id_categoria                      AS categoryId,
          C.nombre_categoria                  AS categoryName,
          P.id_marca                          AS brandId,
          M.nombre_marca                      AS brandName,
          ISNULL(SUM(I.cantidad_disponible),0) AS stock,
          '/' + P.imagen                      AS image,
          P.activo                            AS active
        FROM PRODUCTO P
        LEFT JOIN CATEGORIA  C ON P.id_categoria = C.id_categoria
        LEFT JOIN MARCA      M ON P.id_marca     = M.id_marca
        LEFT JOIN INVENTARIO I ON P.id_producto  = I.id_producto
        WHERE P.id_producto = @id
        GROUP BY
          P.id_producto, P.nombre_producto, P.precio,
          P.id_categoria, C.nombre_categoria,
          P.id_marca, M.nombre_marca,
          P.imagen, P.activo;
      `);

    return recordset[0];
  },

  /* =========================================================
     CREAR + stock inicial
     ========================================================= */
  async createProduct({
    name,
    description = null,
    price,
    categoryId,
    brandId,
    stock = 0,
    imagePath = "assets/images/placeholder-product.png",
    almacenId = 1,
  }) {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);

    await tx.begin();
    try {
      /* 1️⃣ Producto */
      const { recordset } = await tx
        .request()
        .input("name", sql.VarChar, name)
        .input("desc", sql.Text, description)
        .input("price", sql.Decimal(10, 2), price)
        .input("img", sql.VarChar, imagePath)
        .input("cat", sql.Int, categoryId)
        .input("brand", sql.Int, brandId).query(`
          INSERT INTO PRODUCTO
            (nombre_producto, descripcion, precio, imagen,
             id_categoria, id_marca, activo)
          VALUES (@name, @desc, @price, @img, @cat, @brand, 1);
          SELECT SCOPE_IDENTITY() AS newId;
        `);

      const newId = recordset[0].newId;

      /* 2️⃣ Stock */
      await tx.request().input("stk", sql.Int, stock).input("pid", sql.Int, newId).input("alm", sql.Int, almacenId).query(`
          INSERT INTO INVENTARIO
            (cantidad_disponible, id_producto, id_almacen)
          VALUES (@stk, @pid, @alm);
        `);

      await tx.commit();
      return newId;
    } catch (err) {
      await tx.rollback();
      throw new Error("Error al crear producto: " + err.message);
    }
  },

  /* =========================================================
     ACTUALIZAR
     ========================================================= */
  async updateProduct(id, { name, description, price, categoryId, brandId, imagePath }) {
    const pool = await poolPromise;

    const sqlUpdate = `
      UPDATE PRODUCTO
      SET  nombre_producto = @name,
           descripcion     = @description,
           precio          = @price,
           id_categoria    = @catId,
           id_marca        = @brandId
           ${imagePath ? ", imagen = @img" : ""}
      WHERE id_producto = @id;
    `;

    const req = pool
      .request()
      .input("id", sql.Int, id)
      .input("name", sql.VarChar, name)
      .input("description", sql.Text, description)
      .input("price", sql.Decimal(10, 2), price)
      .input("catId", sql.Int, categoryId)
      .input("brandId", sql.Int, brandId);
    if (imagePath) req.input("img", sql.VarChar, imagePath);

    await req.query(sqlUpdate);
    return true;
  },

  /* =========================================================
     DESACTIVAR (soft delete)
     ========================================================= */
  async deactivateProduct(id) {
    const pool = await poolPromise;
    await pool.request().input("id", sql.Int, id).query("UPDATE PRODUCTO SET activo = 0 WHERE id_producto = @id;");
    return true;
  },

  /* =========================================================
     ACTIVAR nuevamente
     ========================================================= */
  async activateProduct(id) {
    const pool = await poolPromise;
    await pool.request().input("id", sql.Int, id).query("UPDATE PRODUCTO SET activo = 1 WHERE id_producto = @id;");
    return true;
  },

  /* =========================================================
     ELIMINAR DEFINITIVO (hard delete)
     ========================================================= */
  async hardDeleteProduct(id) {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      /* eliminar dependencias directas */
      await tx.request().input("id", sql.Int, id).query("DELETE FROM INVENTARIO WHERE id_producto = @id;");
      /* …agrega otras tablas hijas si fuera necesario… */

      /* finalmente el propio producto */
      await tx.request().input("id", sql.Int, id).query("DELETE FROM PRODUCTO WHERE id_producto = @id;");

      await tx.commit();
      return true;
    } catch (err) {
      await tx.rollback();
      throw new Error("Error en hard delete: " + err.message);
    }
  },
};

module.exports = Product;
