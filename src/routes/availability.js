const express = require('express');
const router = express.Router();
const AvailabilityController = require('../controllers/AvailabilityController');
const { authMiddleware } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authMiddleware);

// Availability routes
router.get('/:providerId/:date', AvailabilityController.getAvailableSlots);
router.get('/schedule/:providerId', AvailabilityController.getSchedule);
router.get('/exceptions/:providerId', AvailabilityController.getExceptions);
router.get('/next/:providerId/:serviceId', AvailabilityController.getNextAvailable);

router.post('/schedule', AvailabilityController.createOrUpdateSchedule);
router.post('/exception', AvailabilityController.addException);
router.post('/check', AvailabilityController.checkAvailability);
router.post('/bulk-update', AvailabilityController.bulkUpdate);

router.delete('/exception/:id', AvailabilityController.removeException);

module.exports = router;