const Product = require("../models/Product");
const productRepository = require("../repositories/productRepository");
const { normalizeImageUrl } = require("../shared/image");

function normalizeRowImage(row) {
  if (!row) return row;
  return { ...row, imagen: normalizeImageUrl(row.imagen) };
}

async function getCategories() {
  return productRepository.getCategories();
}

async function getBrands() {
  return productRepository.getBrands();
}

async function listProducts(filters) {
  const rows = await productRepository.listProducts(filters);
  return rows.map(normalizeRowImage);
}

async function getProductByIdPublic(id) {
  const row = await productRepository.getProductByIdPublic(id);
  return normalizeRowImage(row);
}

async function createProduct({ name, description, price, categoryId, brandId, stock, imagePath }) {
  const newId = await Product.createProduct({
    name,
    description,
    price,
    categoryId,
    brandId,
    stock,
    imagePath,
  });

  const created = await Product.getProductById(newId);
  if (created) created.imagen = normalizeImageUrl(created.imagen);
  return created;
}

async function updateProduct(id, { name, description, price, categoryId, brandId, imagePath }) {
  await Product.updateProduct(id, {
    name,
    description,
    price,
    categoryId,
    brandId,
    imagePath,
  });

  const updated = await Product.getProductById(id);
  if (updated) updated.imagen = normalizeImageUrl(updated.imagen);
  return updated;
}

async function deactivateProduct(id) {
  await Product.deactivateProduct(id);
}

async function activateProduct(id) {
  await Product.activateProduct(id);
}

async function hardDeleteProduct(id) {
  await Product.hardDeleteProduct(id);
}

module.exports = {
  getCategories,
  getBrands,
  listProducts,
  getProductByIdPublic,
  createProduct,
  updateProduct,
  deactivateProduct,
  activateProduct,
  hardDeleteProduct,
};

export {};
