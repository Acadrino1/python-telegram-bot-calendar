
const BookingSlotService = require('./BookingSlotService');

class AvailabilityService {
  static async getAvailableSlots(providerId, date, serviceId) {
    const service = new BookingSlotService();
    const slots = await service.getAvailableTimeSlots(date);
    return slots;
  }

  static async getProviderSchedule(providerId) {
    // Return default schedule
    return {
      provider_id: providerId,
      monday: { start: '11:00', end: '20:00', available: true },
      tuesday: { start: '11:00', end: '20:00', available: true },
      wednesday: { start: '11:00', end: '20:00', available: true },
      thursday: { start: '11:00', end: '20:00', available: true },
      friday: { start: '11:00', end: '20:00', available: true },
      saturday: { start: '11:00', end: '20:00', available: true },
      sunday: { available: false }
    };
  }

  static async setProviderSchedule(providerId, schedule) {
    return { ...schedule, provider_id: providerId };
  }

  static async addException(providerId, date, type, reason) {
    return {
      id: Date.now(),
      provider_id: providerId,
      date,
      type,
      reason
    };
  }

  static async getException(id) {
    return null;
  }

  static async removeException(id) {
    return true;
  }

  static async getProviderExceptions(providerId, startDate, endDate) {
    return [];
  }

  static async checkSlotAvailability(providerId, date, time, serviceId) {
    const service = new BookingSlotService();
    return await service.isSlotAvailable(date, time);
  }

  static async findNextAvailableSlot(providerId, serviceId) {
    const service = new BookingSlotService();
    const dates = service.getAvailableDates(7);
    if (dates.length > 0) {
      const slots = await service.getAvailableTimeSlots(dates[0].date);
      if (slots.length > 0) {
        return {
          date: dates[0].date,
          time: slots[0].time
        };
      }
    }
    return null;
  }

  static async bulkUpdateAvailability(updates) {
    return updates.map(u => ({ ...u, success: true }));
  }
}

module.exports = AvailabilityService;