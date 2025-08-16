// backend/routes/paymentRoutes.js
const express = require('express');
const { authenticateToken } = require('../middlewares/authMiddleware');
const paymentCtrl = require('../controllers/paymentController');

const router = express.Router();

router.post('/izipay/init', authenticateToken, paymentCtrl.initIzipay);
router.post('/izipay/mock-confirm', authenticateToken, paymentCtrl.mockConfirm);

module.exports = router;
