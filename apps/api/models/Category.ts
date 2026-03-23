// backend/models/Category.js
const path = require("path");
const { poolPromise } = require(path.join(__dirname, "..", "config", "db.config"));

const Category = {
  async getAll() {
    const pool = await poolPromise;
    const result = await pool.query(`
      SELECT
        c.id_categoria AS id,
        c.nombre_categoria AS nombre,
        COUNT(p.id_producto)::int AS total_productos
      FROM categoria c
      LEFT JOIN producto p ON p.id_categoria = c.id_categoria
      GROUP BY c.id_categoria, c.nombre_categoria
      ORDER BY nombre_categoria ASC
    `);
    return result.rows || [];
  },

  async create({ nombre }) {
    const pool = await poolPromise;
    const result = await pool.query(
      `
        INSERT INTO categoria (nombre_categoria)
        VALUES ($1)
        RETURNING id_categoria AS id, nombre_categoria AS nombre
      `,
      [nombre.trim()],
    );
    return result.rows[0];
  },

  async update(id, { nombre }) {
    const pool = await poolPromise;
    await pool.query(`UPDATE categoria SET nombre_categoria = $2 WHERE id_categoria = $1`, [id, nombre.trim()]);
    return { id, nombre: nombre.trim() };
  },

  async remove(id) {
    const pool = await poolPromise;

    // Verificamos referencias de productos
    const ref = await pool.query(`SELECT COUNT(1) AS usados FROM producto WHERE id_categoria = $1`, [id]);

    if (Number(ref.rows[0].usados || 0) > 0) {
      const err = new Error("No se puede eliminar: hay productos usando esta categoría.");
      (err as any).code = "CATEGORY_IN_USE";
      throw err;
    }

    await pool.query(`DELETE FROM categoria WHERE id_categoria = $1`, [id]);
    return { id };
  },
};

module.exports = Category;

export {};
