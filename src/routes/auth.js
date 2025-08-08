const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/AuthController');
const { authMiddleware } = require('../middleware/auth');

// Public routes
router.post('/register', AuthController.register);
router.post('/login', AuthController.login);
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);

// Protected routes
router.use(authMiddleware); // Apply authentication middleware to all routes below

router.post('/logout', AuthController.logout);
router.get('/me', AuthController.getProfile);
router.put('/me', AuthController.updateProfile);
router.post('/change-password', AuthController.changePassword);

module.exports = router;