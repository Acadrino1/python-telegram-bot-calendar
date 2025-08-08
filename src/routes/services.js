const express = require('express');
const router = express.Router();
const ServiceController = require('../controllers/ServiceController');
const { authMiddleware } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authMiddleware);

// Service routes
router.get('/', ServiceController.getAll);
router.get('/providers/:category', ServiceController.getProvidersByCategory);
router.get('/:id', ServiceController.getById);
router.get('/:id/stats', ServiceController.getStats);
router.post('/', ServiceController.create);
router.put('/:id', ServiceController.update);
router.delete('/:id', ServiceController.delete);

module.exports = router;