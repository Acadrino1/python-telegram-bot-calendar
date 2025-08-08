const express = require('express');
const router = express.Router();
const WaitlistController = require('../controllers/WaitlistController');
const { authMiddleware } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authMiddleware);

// Waitlist routes
router.get('/', WaitlistController.getAll);
router.get('/stats', WaitlistController.getStatistics);
router.get('/:id', WaitlistController.getById);
router.get('/:id/position', WaitlistController.getPosition);

router.post('/', WaitlistController.join);
router.post('/process', WaitlistController.processWaitlist);

router.put('/:id', WaitlistController.update);

router.delete('/:id', WaitlistController.leave);

module.exports = router;