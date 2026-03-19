const bcrypt = require("bcryptjs");
const userManagementRepository = require("../repositories/userManagementRepository");

function createHttpError(status, message) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

function normText(v) {
  return String(v == null ? "" : v).trim();
}

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function isValidPhone(phone) {
  if (!phone) return true;
  return /^[0-9+\-\s()]{6,20}$/.test(String(phone).trim());
}

function isValidName(value) {
  return /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s'.-]{2,60}$/.test(String(value || "").trim());
}

function isValidPassword(value) {
  return /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(value || ""));
}

function isValidLicense(value) {
  return /^[A-Za-z0-9\-]{3,50}$/.test(String(value || "").trim());
}

function getBcryptSaltRounds() {
  const raw = process.env.BCRYPT_SALT_ROUNDS;
  const n = Number.parseInt(String(raw || ""), 10);
  return Number.isFinite(n) && n >= 8 && n <= 15 ? n : 10;
}

function assertActor(actorUserId) {
  const id = Number(actorUserId);
  if (!Number.isInteger(id) || id <= 0) throw createHttpError(401, "Usuario no autenticado");
  return id;
}

function assertUpdatableRole(rol) {
  if (rol !== "EMPLEADO" && rol !== "REPARTIDOR") {
    throw createHttpError(403, "Solo se pueden gestionar cuentas de EMPLEADO o REPARTIDOR.");
  }
}

function validateCommonInput({ nombre, apellido, email, telefono }) {
  if (!isValidName(nombre)) throw createHttpError(400, "Nombre inválido.");
  if (!isValidName(apellido)) throw createHttpError(400, "Apellido inválido.");
  if (!isValidEmail(email)) throw createHttpError(400, "Email inválido.");
  if (!isValidPhone(telefono)) throw createHttpError(400, "Teléfono inválido.");
}

async function ensureRiderMotorizadoLinked(tx, { userId, nombre, apellido, telefono, licencia }) {
  const orphan = await userManagementRepository.findOrphanMotorizadoCandidateTx(tx, {
    nombre,
    apellido,
    telefono,
  });

  if (orphan?.id_motorizado) {
    await userManagementRepository.relinkMotorizadoToUserTx(tx, {
      id_motorizado: orphan.id_motorizado,
      id_usuario: userId,
    });

    await userManagementRepository.updateMotorizadoByUserIdTx(tx, userId, {
      nombre,
      apellido,
      telefono,
      licencia: licencia || orphan.licencia || "",
    });

    return { relinked: true, created: false };
  }

  if (licencia) {
    await userManagementRepository.createMotorizadoForUserTx(tx, {
      id_usuario: userId,
      nombre,
      apellido,
      telefono,
      licencia,
    });
    return { relinked: false, created: true };
  }

  return { relinked: false, created: false };
}

async function listUsers({ page = 1, pageSize = 20, rol = "", estado = "", search = "" } = {}) {
  const safeRole = normalizeRole(rol);
  if (safeRole === "ADMINISTRADOR") {
    throw createHttpError(400, "No se permite listar usuarios administradores en este módulo.");
  }
  return userManagementRepository.listUsersPaginated({ page, pageSize, rol: safeRole, estado, search });
}

async function createEmployee({ actorUserId, nombre, apellido, email, plainPwd, telefono, direccion_principal }) {
  const actorId = assertActor(actorUserId);
  const clean = {
    nombre: normText(nombre),
    apellido: normText(apellido),
    email: normText(email).toLowerCase(),
    telefono: normText(telefono),
    direccion_principal: normText(direccion_principal),
    plainPwd: String(plainPwd || "").trim(),
  };

  validateCommonInput(clean);
  if (!isValidPassword(clean.plainPwd)) {
    throw createHttpError(400, "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.");
  }

  const pool = await userManagementRepository.getPool();
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const existing = await userManagementRepository.getUserByEmail(tx, clean.email);
    if (existing) throw createHttpError(409, "El correo ya está registrado.");

    const passwordHash = await bcrypt.hash(clean.plainPwd, getBcryptSaltRounds());
    const newId = await userManagementRepository.createUserWithRoleTx(tx, {
      nombre: clean.nombre,
      apellido: clean.apellido,
      email: clean.email,
      contrasena: passwordHash,
      telefono: clean.telefono || null,
      direccion_principal: clean.direccion_principal || null,
      rol: "EMPLEADO",
    });

    await tx.query(
      `
        INSERT INTO historial (descripcion, accion, id_usuario)
        VALUES ($1, $2, $3)
      `,
      [`Creó empleado id=${newId}, email=${clean.email}`, "USUARIO_EMPLEADO_CREADO", actorId],
    );

    await tx.query("COMMIT");
    return userManagementRepository.getUserById(null, newId);
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function createRider({ actorUserId, nombre, apellido, email, plainPwd, telefono, direccion_principal, licencia }) {
  const actorId = assertActor(actorUserId);
  const clean = {
    nombre: normText(nombre),
    apellido: normText(apellido),
    email: normText(email).toLowerCase(),
    telefono: normText(telefono),
    direccion_principal: normText(direccion_principal),
    plainPwd: String(plainPwd || "").trim(),
    licencia: normText(licencia).toUpperCase(),
  };

  validateCommonInput(clean);
  if (!isValidPassword(clean.plainPwd)) {
    throw createHttpError(400, "La contraseña debe tener mínimo 8 caracteres, una mayúscula y un número.");
  }
  if (!isValidLicense(clean.licencia)) throw createHttpError(400, "Licencia inválida.");

  const pool = await userManagementRepository.getPool();
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const existing = await userManagementRepository.getUserByEmail(tx, clean.email);
    if (existing) throw createHttpError(409, "El correo ya está registrado.");

    const passwordHash = await bcrypt.hash(clean.plainPwd, getBcryptSaltRounds());
    const newId = await userManagementRepository.createUserWithRoleTx(tx, {
      nombre: clean.nombre,
      apellido: clean.apellido,
      email: clean.email,
      contrasena: passwordHash,
      telefono: clean.telefono || null,
      direccion_principal: clean.direccion_principal || null,
      rol: "REPARTIDOR",
    });

    await userManagementRepository.createMotorizadoForUserTx(tx, {
      id_usuario: newId,
      nombre: clean.nombre,
      apellido: clean.apellido,
      telefono: clean.telefono || "",
      licencia: clean.licencia,
    });

    await tx.query(
      `
        INSERT INTO historial (descripcion, accion, id_usuario)
        VALUES ($1, $2, $3)
      `,
      [`Creó repartidor id=${newId}, email=${clean.email}`, "USUARIO_REPARTIDOR_CREADO", actorId],
    );

    await tx.query("COMMIT");
    return userManagementRepository.getUserById(null, newId);
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function updateUser({ actorUserId, userId, nombre, apellido, email, telefono, direccion_principal, licencia }) {
  const actorId = assertActor(actorUserId);
  const targetId = Number(userId);
  if (!Number.isInteger(targetId) || targetId <= 0) throw createHttpError(400, "id de usuario inválido.");

  const pool = await userManagementRepository.getPool();
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const existing = await userManagementRepository.getUserById(tx, targetId);
    if (!existing) throw createHttpError(404, "Usuario no encontrado.");
    assertUpdatableRole(String(existing.rol || "").toUpperCase());

    const clean = {
      nombre: normText(nombre),
      apellido: normText(apellido),
      email: normText(email).toLowerCase(),
      telefono: normText(telefono),
      direccion_principal: normText(direccion_principal),
      licencia: normText(licencia).toUpperCase(),
    };

    validateCommonInput(clean);

    const duplicate = await userManagementRepository.getUserByEmail(tx, clean.email);
    if (duplicate && Number(duplicate.id_usuario) !== targetId) {
      throw createHttpError(409, "El correo ya está registrado.");
    }

    await userManagementRepository.updateUserByIdTx(tx, targetId, {
      nombre: clean.nombre,
      apellido: clean.apellido,
      email: clean.email,
      telefono: clean.telefono || null,
      direccion_principal: clean.direccion_principal || null,
    });

    if (String(existing.rol || "").toUpperCase() === "REPARTIDOR") {
      if (!isValidLicense(clean.licencia)) throw createHttpError(400, "Licencia inválida.");

      if (existing.id_motorizado) {
        await userManagementRepository.updateMotorizadoByUserIdTx(tx, targetId, {
          nombre: clean.nombre,
          apellido: clean.apellido,
          telefono: clean.telefono || "",
          licencia: clean.licencia,
        });
      } else {
        await ensureRiderMotorizadoLinked(tx, {
          userId: targetId,
          nombre: clean.nombre,
          apellido: clean.apellido,
          telefono: clean.telefono || "",
          licencia: clean.licencia,
        });
      }
    }

    await tx.query(
      `
        INSERT INTO historial (descripcion, accion, id_usuario)
        VALUES ($1, $2, $3)
      `,
      [`Actualizó usuario id=${targetId}`, "USUARIO_ACTUALIZADO", actorId],
    );

    await tx.query("COMMIT");
    return userManagementRepository.getUserById(null, targetId);
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function deactivateUser({ actorUserId, userId }) {
  const actorId = assertActor(actorUserId);
  const targetId = Number(userId);
  if (!Number.isInteger(targetId) || targetId <= 0) throw createHttpError(400, "id de usuario inválido.");

  const pool = await userManagementRepository.getPool();
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const existing = await userManagementRepository.getUserById(tx, targetId);
    if (!existing) throw createHttpError(404, "Usuario no encontrado.");
    assertUpdatableRole(String(existing.rol || "").toUpperCase());

    if (String(existing.estado || "").toUpperCase() === "INACTIVO") {
      throw createHttpError(409, "El usuario ya está inactivo.");
    }

    await userManagementRepository.setUserInactiveByIdTx(tx, targetId);
    if (String(existing.rol || "").toUpperCase() === "REPARTIDOR") {
      await userManagementRepository.unlinkMotorizadoByUserIdTx(tx, targetId);
    }

    await tx.query(
      `
        INSERT INTO historial (descripcion, accion, id_usuario)
        VALUES ($1, $2, $3)
      `,
      [`Desactivó usuario id=${targetId}`, "USUARIO_DESACTIVADO", actorId],
    );

    await tx.query("COMMIT");
    return { ok: true, id_usuario: targetId, estado: "INACTIVO" };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
  }
}

async function reactivateUser({ actorUserId, userId }) {
  const actorId = assertActor(actorUserId);
  const targetId = Number(userId);
  if (!Number.isInteger(targetId) || targetId <= 0) throw createHttpError(400, "id de usuario inválido.");
  if (actorId === targetId) throw createHttpError(400, "No puedes reactivar tu propia cuenta desde este módulo.");

  const pool = await userManagementRepository.getPool();
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");

    const existing = await userManagementRepository.getUserById(tx, targetId);
    if (!existing) throw createHttpError(404, "Usuario no encontrado.");
    assertUpdatableRole(String(existing.rol || "").toUpperCase());

    if (String(existing.estado || "").toUpperCase() === "ACTIVO") {
      throw createHttpError(409, "El usuario ya está activo.");
    }

    await userManagementRepository.setUserActiveByIdTx(tx, targetId);

    let riderLinkRecovered = false;
    if (String(existing.rol || "").toUpperCase() === "REPARTIDOR" && !existing.id_motorizado) {
      const riderLinkResult = await ensureRiderMotorizadoLinked(tx, {
        userId: targetId,
        nombre: existing.nombre,
        apellido: existing.apellido,
        telefono: existing.telefono || "",
        licencia: existing.licencia || "",
      });
      riderLinkRecovered = Boolean(riderLinkResult.relinked || riderLinkResult.created);
    }

    await tx.query(
      `
        INSERT INTO historial (descripcion, accion, id_usuario)
        VALUES ($1, $2, $3)
      `,
      [
        `Reactivó usuario id=${targetId}${String(existing.rol || "").toUpperCase() === "REPARTIDOR" ? `, vinculo_motorizado=${riderLinkRecovered ? "RECUPERADO" : "PENDIENTE"}` : ""}`,
        "USUARIO_REACTIVADO",
        actorId,
      ],
    );

    await tx.query("COMMIT");
    return {
      ok: true,
      id_usuario: targetId,
      estado: "ACTIVO",
      rider_delivery_link_recovered: riderLinkRecovered,
    };
  } catch (err) {
    try {
      await tx.query("ROLLBACK");
    } catch {}
    throw err;
  } finally {
    tx.release();
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
