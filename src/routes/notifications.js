const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/NotificationController');
const { authMiddleware } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authMiddleware);

// Notification routes
router.get('/', NotificationController.getAll);
router.get('/stats', NotificationController.getStatistics);
router.get('/templates', NotificationController.getTemplates);
router.get('/:id', NotificationController.getById);

router.post('/', NotificationController.create);
router.post('/test', NotificationController.testNotification);
router.post('/templates', NotificationController.createTemplate);
router.post('/:id/resend', NotificationController.resend);

router.put('/templates/:id', NotificationController.updateTemplate);

router.delete('/:id', NotificationController.cancel);
router.delete('/templates/:id', NotificationController.deleteTemplate);

module.exports = router;