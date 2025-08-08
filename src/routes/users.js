const express = require('express');
const router = express.Router();
const UserController = require('../controllers/UserController');
const { authMiddleware } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authMiddleware);

// User routes
router.get('/', UserController.getAll);
router.get('/providers', UserController.getProviders);
router.get('/stats', UserController.getStatistics);
router.get('/:id', UserController.getById);
router.get('/:id/appointments', UserController.getUserAppointments);

router.post('/', UserController.create);
router.post('/:id/reset-password', UserController.resetPassword);

router.put('/:id', UserController.update);

router.delete('/:id', UserController.delete);

module.exports = router;