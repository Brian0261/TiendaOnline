const userManagementService = require("../services/userManagementService");

function normText(v) {
  return String(v == null ? "" : v).trim();
}

function getStatus(err) {
  return typeof err?.status === "number" ? err.status : 500;
}

function parsePage(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function listUsers(req, res) {
  try {
    const data = await userManagementService.listUsers({
      page: parsePage(req.query?.page, 1),
      pageSize: parsePage(req.query?.pageSize, 20),
      rol: normText(req.query?.rol),
      estado: normText(req.query?.estado),
      search: normText(req.query?.search),
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("userManagement.listUsers:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error al listar usuarios." });
  }
}

async function createEmployee(req, res) {
  try {
    const data = await userManagementService.createEmployee({
      actorUserId: req.user?.id_usuario,
      nombre: req.body?.nombre,
      apellido: req.body?.apellido,
      email: req.body?.email,
      plainPwd: req.body?.contrasena ?? req.body?.password,
      telefono: req.body?.telefono,
      direccion_principal: req.body?.direccion_principal,
    });
    return res.status(201).json(data);
  } catch (err) {
    console.error("userManagement.createEmployee:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error al crear empleado." });
  }
}

async function createRider(req, res) {
  try {
    const data = await userManagementService.createRider({
      actorUserId: req.user?.id_usuario,
      nombre: req.body?.nombre,
      apellido: req.body?.apellido,
      email: req.body?.email,
      plainPwd: req.body?.contrasena ?? req.body?.password,
      telefono: req.body?.telefono,
      direccion_principal: req.body?.direccion_principal,
      licencia: req.body?.licencia,
    });
    return res.status(201).json(data);
  } catch (err) {
    console.error("userManagement.createRider:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error al crear repartidor." });
  }
}

async function updateUser(req, res) {
  try {
    const data = await userManagementService.updateUser({
      actorUserId: req.user?.id_usuario,
      userId: req.params?.id,
      nombre: req.body?.nombre,
      apellido: req.body?.apellido,
      email: req.body?.email,
      telefono: req.body?.telefono,
      direccion_principal: req.body?.direccion_principal,
      licencia: req.body?.licencia,
      rol: req.body?.rol,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("userManagement.updateUser:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error al actualizar usuario." });
  }
}

async function deactivateUser(req, res) {
  try {
    const data = await userManagementService.deactivateUser({
      actorUserId: req.user?.id_usuario,
      userId: req.params?.id,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("userManagement.deactivateUser:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error al desactivar usuario." });
  }
}

async function reactivateUser(req, res) {
  try {
    const data = await userManagementService.reactivateUser({
      actorUserId: req.user?.id_usuario,
      userId: req.params?.id,
    });
    return res.status(200).json(data);
  } catch (err) {
    console.error("userManagement.reactivateUser:", err);
    return res.status(getStatus(err)).json({ message: err?.message || "Error al reactivar usuario." });
  }
}

module.exports = {
  listUsers,
  createEmployee,
  createRider,
  updateUser,
  deactivateUser,
  reactivateUser,
};

export {};
