// backend/models/Category.js
const path = require("path");
const { sql, poolPromise } = require(path.join(__dirname, "..", "config", "db.config"));

const Category = {
  async getAll() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT id_categoria AS id, nombre_categoria AS nombre
      FROM CATEGORIA
      ORDER BY nombre_categoria ASC
    `);
    return result.recordset;
  },

  async create({ nombre }) {
    const pool = await poolPromise;
    const result = await pool.request().input("nombre", sql.VarChar(100), nombre.trim()).query(`
        INSERT INTO CATEGORIA (nombre_categoria)
        OUTPUT INSERTED.id_categoria AS id, INSERTED.nombre_categoria AS nombre
        VALUES (@nombre)
      `);
    return result.recordset[0];
  },

  async update(id, { nombre }) {
    const pool = await poolPromise;
    await pool
      .request()
      .input("id", sql.Int, id)
      .input("nombre", sql.VarChar(100), nombre.trim())
      .query(`UPDATE CATEGORIA SET nombre_categoria = @nombre WHERE id_categoria = @id`);
    return { id, nombre: nombre.trim() };
  },

  async remove(id) {
    const pool = await poolPromise;

    // Verificamos referencias de productos
    const ref = await pool.request().input("id", sql.Int, id).query(`SELECT COUNT(1) AS usados FROM PRODUCTO WHERE id_categoria = @id`);

    if (ref.recordset[0].usados > 0) {
      const err = new Error("No se puede eliminar: hay productos usando esta categoría.");
      err.code = "CATEGORY_IN_USE";
      throw err;
    }

    await pool.request().input("id", sql.Int, id).query(`DELETE FROM CATEGORIA WHERE id_categoria = @id`);
    return { id };
  },
};

module.exports = Category;
