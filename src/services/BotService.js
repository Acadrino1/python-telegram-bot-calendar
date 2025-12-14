const User = require('../models/User');
const logger = require('../utils/logger');

class BotService {

  static async broadcastMessage(message, targetAudience = 'all') {
    try {
      // Get target users based on audience
      let users;
      
      switch (targetAudience) {
        case 'clients':
          users = await User.query()
            .where('role', 'client')
            .where('is_active', true)
            .whereNotNull('telegram_id');
          break;
          
        case 'providers':
          users = await User.query()
            .where('role', 'provider')
            .where('is_active', true)
            .whereNotNull('telegram_id');
          break;
          
        case 'approved':
          users = await User.query()
            .where('approval_status', 'approved')
            .where('is_active', true)
            .whereNotNull('telegram_id');
          break;
          
        case 'pending':
          users = await User.query()
            .where('approval_status', 'pending')
            .whereNotNull('telegram_id');
          break;
          
        default: // 'all'
          users = await User.query()
            .where('is_active', true)
            .whereNotNull('telegram_id');
      }

      if (users.length === 0) {
        return {
          success: true,
          message: 'No users found matching criteria',
          targetCount: 0,
          sentCount: 0,
          failedCount: 0
        };
      }

      // Send messages in batches to avoid rate limiting
      const batchSize = 10;
      const batches = [];
      
      for (let i = 0; i < users.length; i += batchSize) {
        batches.push(users.slice(i, i + batchSize));
      }

      let sentCount = 0;
      let failedCount = 0;
      const failures = [];

      for (const batch of batches) {
        const batchPromises = batch.map(async (user) => {
          try {
            // This would integrate with the actual Telegram bot
            // For now, we'll simulate the sending
            await this.sendTelegramMessage(user.telegram_id, message);
            
            // Update user's last activity
            await user.updateBotInteractionCount();
            
            sentCount++;
            return { success: true, userId: user.id };
          } catch (error) {
            failedCount++;
            failures.push({
              userId: user.id,
              telegramId: user.telegram_id,
              error: error.message
            });
            return { success: false, userId: user.id, error: error.message };
          }
        });

        await Promise.all(batchPromises);
        
        // Add delay between batches to respect rate limits
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info('Broadcast message sent', {
        targetAudience,
        targetCount: users.length,
        sentCount,
        failedCount,
        message: message.substring(0, 100) + '...'
      });

      return {
        success: true,
        message: 'Broadcast completed',
        targetCount: users.length,
        sentCount,
        failedCount,
        failures: failedCount > 0 ? failures : undefined
      };

    } catch (error) {
      logger.error('Broadcast message failed', { error: error.stack });
      return {
        success: false,
        message: 'Broadcast failed',
        error: error.message
      };
    }
  }

  static async sendTelegramMessage(telegramId, message) {
    // This would integrate with the actual Telegram bot instance
    // For now, we'll simulate the API call
    
    return new Promise((resolve, reject) => {
      // Simulate API call delay
      setTimeout(() => {
        // Simulate 5% failure rate for demo
        if (Math.random() < 0.05) {
          reject(new Error('Telegram API error: Message delivery failed'));
        } else {
          resolve({ success: true, message_id: Date.now() });
        }
      }, 100);
    });
  }

  static async sendAppointmentReminder(appointment, reminderType = '24h') {
    try {
      if (!appointment.client || !appointment.client.telegram_id) {
        return { success: false, error: 'No Telegram ID for client' };
      }

      const reminderMessages = {
        '24h': `🔔 Reminder: You have an appointment tomorrow at ${new Date(appointment.appointment_datetime).toLocaleTimeString()}\n\n📋 Service: ${appointment.service?.name || 'Appointment'}\n👨‍⚕️ Provider: ${appointment.provider?.getFullName?.() || 'Provider'}\n\n💡 Please reply CONFIRM to confirm or CANCEL to cancel.`,
        
        '1h': `⏰ Your appointment starts in 1 hour!\n\n📅 Time: ${new Date(appointment.appointment_datetime).toLocaleTimeString()}\n📋 Service: ${appointment.service?.name || 'Appointment'}\n👨‍⚕️ Provider: ${appointment.provider?.getFullName?.() || 'Provider'}\n\nSee you soon! 👋`,
        
        'confirmation': `✅ Appointment Confirmed!\n\n📅 Date: ${new Date(appointment.appointment_datetime).toLocaleDateString()}\n⏰ Time: ${new Date(appointment.appointment_datetime).toLocaleTimeString()}\n📋 Service: ${appointment.service?.name || 'Appointment'}\n👨‍⚕️ Provider: ${appointment.provider?.getFullName?.() || 'Provider'}\n\n🔄 Booking ID: ${appointment.uuid}\n\n💡 Need to reschedule? Reply RESCHEDULE\n❌ Need to cancel? Reply CANCEL`,
        
        'cancellation': `❌ Appointment Cancelled\n\n📅 Original Date: ${new Date(appointment.appointment_datetime).toLocaleDateString()}\n⏰ Original Time: ${new Date(appointment.appointment_datetime).toLocaleTimeString()}\n📋 Service: ${appointment.service?.name || 'Appointment'}\n\n💡 To book a new appointment, use /book command.`
      };

      const message = reminderMessages[reminderType] || reminderMessages['24h'];
      
      await this.sendTelegramMessage(appointment.client.telegram_id, message);
      
      // Mark reminder as sent
      await appointment.markReminderSent(reminderType);
      
      return { success: true, type: reminderType };
      
    } catch (error) {
      logger.error('Failed to send appointment reminder', {
        appointmentId: appointment.id,
        reminderType,
        error: error.stack
      });
      
      return { success: false, error: error.message };
    }
  }

  static async getBotMetrics() {
    try {
      const stats = await User.getRegistrationStats();
      
      // Additional bot-specific metrics
      const [recentInteractions, topActiveUsers] = await Promise.all([
        User.query()
          .whereNotNull('telegram_id')
          .where('last_activity_at', '>', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
          
        User.query()
          .whereNotNull('telegram_id')
          .orderBy('bot_interaction_count', 'desc')
          .limit(10)
          .select('id', 'first_name', 'last_name', 'telegram_username', 'bot_interaction_count', 'last_activity_at')
      ]);

      return {
        ...stats,
        recentInteractions: parseInt(recentInteractions.count),
        topActiveUsers: topActiveUsers.map(user => ({
          name: user.getFullName(),
          username: user.telegram_username,
          interactions: user.bot_interaction_count,
          lastActive: user.last_activity_at
        }))
      };
      
    } catch (error) {
      logger.error('Failed to get bot metrics', { error: error.stack });
      return {
        error: 'Failed to fetch bot metrics',
        message: error.message
      };
    }
  }

  static async processWebhook(update) {
    try {
      // This would handle incoming messages, commands, etc.
      // Integration with existing bot logic
      
      if (update.message) {
        const message = update.message;
        const userId = message.from.id;
        
        // Find or create user
        let user = await User.findByTelegramId(userId);
        
        if (user) {
          await user.updateBotInteractionCount();
        }
        
        // Process commands, handle responses, etc.
        // This would integrate with the existing bot command handlers
      }
      
      return { success: true };
      
    } catch (error) {
      logger.error('Webhook processing failed', { error: error.stack });
      return { success: false, error: error.message };
    }
  }
}

module.exports = BotService;