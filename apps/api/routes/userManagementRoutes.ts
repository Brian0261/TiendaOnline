const express = require("express");
const { authenticateToken, authorizeRoles } = require("../middlewares/authMiddleware");
const userManagementController = require("../controllers/userManagementController");

const router = express.Router();

router.use(authenticateToken, authorizeRoles("ADMINISTRADOR"));

router.get("/", userManagementController.listUsers);
router.post("/employees", userManagementController.createEmployee);
router.post("/riders", userManagementController.createRider);
router.put("/:id", userManagementController.updateUser);
router.patch("/:id/deactivate", userManagementController.deactivateUser);
router.patch("/:id/reactivate", userManagementController.reactivateUser);

module.exports = router;

export {};
