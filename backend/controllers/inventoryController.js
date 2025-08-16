// backend/controllers/inventoryController.js
const { sql } = require("../config/db.config");

exports.getInventory = async (req, res) => {
  try {
    const { search = "", almacen = "" } = req.query;
    const pool = await require("../config/db.config").poolPromise;

    const filters = [];
    if (almacen) filters.push("I.id_almacen = @almacen");
    if (search)  filters.push("(P.nombre_producto LIKE @search)");

    const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

    const request = pool.request();
    if (almacen) request.input("almacen", sql.Int, Number(almacen));
    if (search)  request.input("search",  sql.VarChar(100), `%${search}%`);

    const q = `
      SELECT
        I.id_inventario,
        I.id_producto,
        I.id_almacen,
        A.nombre_almacen,
        P.nombre_producto,
        I.cantidad_disponible AS stock
      FROM INVENTARIO I
      INNER JOIN PRODUCTO P ON P.id_producto = I.id_producto
      INNER JOIN ALMACEN  A ON A.id_almacen  = I.id_almacen
      ${where}
      ORDER BY P.nombre_producto ASC
    `;

    const result = await request.query(q);
    res.json(result.recordset);
  } catch (err) {
    console.error("getInventory:", err);
    res.status(500).json({ message: "Error al listar inventario" });
  }
};

exports.exportInventory = async (req, res) => {
  try {
    const { search = "", almacen = "" } = req.query;
    const pool = await require("../config/db.config").poolPromise;

    const filters = [];
    const request = pool.request();
    if (almacen) { filters.push("I.id_almacen = @almacen"); request.input("almacen", sql.Int, Number(almacen)); }
    if (search)  { filters.push("(P.nombre_producto LIKE @search)"); request.input("search", sql.VarChar(100), `%${search}%`); }

    const where = filters.length ? "WHERE " + filters.join(" AND ") : "";

    const rs = await request.query(`
      SELECT I.id_inventario,
             P.nombre_producto AS producto,
             A.nombre_almacen  AS almacen,
             I.cantidad_disponible AS stock
      FROM INVENTARIO I
      INNER JOIN PRODUCTO P ON P.id_producto = I.id_producto
      INNER JOIN ALMACEN  A ON A.id_almacen  = I.id_almacen
      ${where}
      ORDER BY P.nombre_producto ASC
    `);

    let csv = "ID Inventario,Producto,Almacén,Stock\n";
    for (const r of rs.recordset) {
      csv += [r.id_inventario, `"${r.producto}"`, `"${r.almacen}"`, r.stock].join(",") + "\n";
    }

    res.header("Content-Type", "text/csv");
    res.attachment("inventario.csv");
    return res.send(csv);
  } catch (err) {
    console.error("exportInventory:", err);
    res.status(500).json({ message: "Error al exportar inventario" });
  }
};
