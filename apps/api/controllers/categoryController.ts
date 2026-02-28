// backend/controllers/categoryController.js
const Category = require("../models/Category");

exports.list = async (req, res) => {
  try {
    const data = await Category.getAll();
    res.json(data);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error obteniendo categorías" });
  }
};

exports.create = async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.status(400).json({ message: "Nombre es requerido" });
    const cat = await Category.create({ nombre });
    res.status(201).json(cat);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error creando categoría" });
  }
};

exports.update = async (req, res) => {
  try {
    const { nombre } = req.body;
    const { id } = req.params;
    if (!nombre || !nombre.trim()) return res.status(400).json({ message: "Nombre es requerido" });
    const cat = await Category.update(Number(id), { nombre });
    res.json(cat);
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Error actualizando categoría" });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Category.remove(Number(id));
    res.json(result);
  } catch (e) {
    if (e.code === "CATEGORY_IN_USE") {
      return res.status(409).json({ message: e.message });
    }
    console.error(e);
    res.status(500).json({ message: "Error eliminando categoría" });
  }
};

export {};
