const User = require('../models/User');
const Appointment = require('../models/Appointment');
const { UserRole } = require('../types');
const csv = require('json2csv');

class UserManagementService {
  // Dashboard data aggregation
  static async getDashboardData() {
    try {
      const [
        userStats,
        recentRegistrations,
        pendingApprovals,
        telegramStats,
        referralStats,
        activityStats
      ] = await Promise.all([
        UserManagementService.getUserStats(),
        UserManagementService.getRecentRegistrations(7),
        UserManagementService.getPendingApprovals(10),
        UserManagementService.getTelegramStats(),
        UserManagementService.getReferralStats(),
        UserManagementService.getActivityStats()
      ]);

      return {
        userStats,
        recentRegistrations,
        pendingApprovals,
        telegramStats,
        referralStats,
        activityStats
      };
    } catch (error) {
      console.error('Dashboard data error:', error);
      throw error;
    }
  }

  // User statistics
  static async getUserStats() {
    try {
      const [
        total,
        pending,
        approved,
        denied,
        telegramUsers,
        activeToday,
        activeWeek
      ] = await Promise.all([
        User.query().count('* as count').first(),
        User.query().where('approval_status', 'pending').count('* as count').first(),
        User.query().where('approval_status', 'approved').count('* as count').first(),
        User.query().where('approval_status', 'denied').count('* as count').first(),
        User.query().whereNotNull('telegram_id').count('* as count').first(),
        User.query()
          .where('last_activity_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        User.query()
          .where('last_activity_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .count('* as count')
          .first()
      ]);

      return {
        total: total.count,
        pending: pending.count,
        approved: approved.count,
        denied: denied.count,
        telegramUsers: telegramUsers.count,
        activeToday: activeToday.count,
        activeWeek: activeWeek.count
      };
    } catch (error) {
      console.error('User stats error:', error);
      return {};
    }
  }

  // Recent registrations
  static async getRecentRegistrations(days = 7) {
    try {
      return await User.query()
        .where('created_at', '>=', new Date(Date.now() - days * 24 * 60 * 60 * 1000))
        .orderBy('created_at', 'desc')
        .select([
          'id', 'email', 'first_name', 'last_name', 'role', 
          'approval_status', 'telegram_username', 'registration_source',
          'created_at', 'last_activity_at'
        ]);
    } catch (error) {
      console.error('Recent registrations error:', error);
      return [];
    }
  }

  // Pending approvals
  static async getPendingApprovals(limit = 10) {
    try {
      return await User.query()
        .where('approval_status', 'pending')
        .orderBy('created_at', 'asc')
        .limit(limit)
        .select([
          'id', 'email', 'first_name', 'last_name', 'role',
          'registration_source', 'created_at', 'telegram_username'
        ]);
    } catch (error) {
      console.error('Pending approvals error:', error);
      return [];
    }
  }

  // User approval workflows
  static async approveUser(userId, approvedBy, reason = null) {
    try {
      const user = await User.query().findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await user.approve(approvedBy);

      // Log the approval
      await UserManagementService.logUserAction(
        'user_approved',
        userId,
        approvedBy,
        { reason }
      );

      return user;
    } catch (error) {
      console.error('User approval error:', error);
      throw error;
    }
  }

  static async denyUser(userId, deniedBy, reason) {
    try {
      const user = await User.query().findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await user.deny(deniedBy);

      // Log the denial
      await UserManagementService.logUserAction(
        'user_denied',
        userId,
        deniedBy,
        { reason }
      );

      return user;
    } catch (error) {
      console.error('User denial error:', error);
      throw error;
    }
  }

  // Bulk operations
  static async bulkApproveUsers(userIds, approvedBy, reason = null) {
    try {
      const results = [];
      
      for (const userId of userIds) {
        try {
          const user = await UserManagementService.approveUser(userId, approvedBy, reason);
          results.push({ userId, status: 'success', user });
        } catch (error) {
          results.push({ userId, status: 'error', error: error.message });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      return { results, successCount, totalCount: userIds.length };
    } catch (error) {
      console.error('Bulk approval error:', error);
      throw error;
    }
  }

  static async bulkDenyUsers(userIds, deniedBy, reason) {
    try {
      const results = [];
      
      for (const userId of userIds) {
        try {
          const user = await UserManagementService.denyUser(userId, deniedBy, reason);
          results.push({ userId, status: 'success', user });
        } catch (error) {
          results.push({ userId, status: 'error', error: error.message });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      return { results, successCount, totalCount: userIds.length };
    } catch (error) {
      console.error('Bulk denial error:', error);
      throw error;
    }
  }

  static async bulkGenerateReferralCodes(userIds) {
    try {
      const results = [];
      
      for (const userId of userIds) {
        try {
          const user = await User.query().findById(userId);
          if (user && !user.referral_code) {
            const code = await user.generateReferralCode();
            results.push({ userId, status: 'success', code });
          } else if (user.referral_code) {
            results.push({ userId, status: 'skipped', reason: 'Already has referral code' });
          } else {
            results.push({ userId, status: 'error', error: 'User not found' });
          }
        } catch (error) {
          results.push({ userId, status: 'error', error: error.message });
        }
      }

      const successCount = results.filter(r => r.status === 'success').length;
      return { results, successCount, totalCount: userIds.length };
    } catch (error) {
      console.error('Bulk referral code generation error:', error);
      throw error;
    }
  }

  // Data export
  static async exportUsers(userIds = null, format = 'csv') {
    try {
      let query = User.query().select([
        'id', 'email', 'first_name', 'last_name', 'phone', 'role',
        'approval_status', 'telegram_id', 'telegram_username',
        'referral_code', 'referral_count', 'registration_source',
        'bot_interaction_count', 'last_activity_at', 'created_at'
      ]);

      if (userIds && Array.isArray(userIds)) {
        query = query.whereIn('id', userIds);
      }

      const users = await query.orderBy('created_at', 'desc');

      const exportData = users.map(user => ({
        ID: user.id,
        Email: user.email,
        'First Name': user.first_name,
        'Last Name': user.last_name,
        Phone: user.phone || '',
        Role: user.role,
        'Approval Status': user.approval_status,
        'Telegram ID': user.telegram_id || '',
        'Telegram Username': user.telegram_username || '',
        'Referral Code': user.referral_code || '',
        'Referral Count': user.referral_count || 0,
        'Registration Source': user.registration_source,
        'Bot Interactions': user.bot_interaction_count || 0,
        'Last Activity': user.last_activity_at || '',
        'Registration Date': user.created_at
      }));

      let fileContent, mimeType, filename;

      switch (format) {
        case 'json':
          fileContent = JSON.stringify(exportData, null, 2);
          mimeType = 'application/json';
          filename = `users-export-${Date.now()}.json`;
          break;
        case 'csv':
        default:
          const csvParser = new csv.Parser();
          fileContent = csvParser.parse(exportData);
          mimeType = 'text/csv';
          filename = `users-export-${Date.now()}.csv`;
          break;
      }

      return {
        content: fileContent,
        mimeType,
        filename,
        recordCount: exportData.length
      };
    } catch (error) {
      console.error('Export users error:', error);
      throw error;
    }
  }

  // Telegram integration stats
  static async getTelegramStats() {
    try {
      const [
        connectedUsers,
        totalInteractions,
        dailyActiveUsers,
        weeklyActiveUsers
      ] = await Promise.all([
        User.query().whereNotNull('telegram_id').count('* as count').first(),
        User.query().sum('bot_interaction_count as total').first(),
        User.query()
          .whereNotNull('telegram_id')
          .where('last_activity_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        User.query()
          .whereNotNull('telegram_id')
          .where('last_activity_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .count('* as count')
          .first()
      ]);

      const avgInteractionsPerUser = connectedUsers.count > 0 
        ? (totalInteractions.total || 0) / connectedUsers.count 
        : 0;

      return {
        connectedUsers: connectedUsers.count,
        totalInteractions: totalInteractions.total || 0,
        dailyActiveUsers: dailyActiveUsers.count,
        weeklyActiveUsers: weeklyActiveUsers.count,
        avgInteractionsPerUser: Math.round(avgInteractionsPerUser * 100) / 100
      };
    } catch (error) {
      console.error('Telegram stats error:', error);
      return {};
    }
  }

  // Referral system stats
  static async getReferralStats(days = 30) {
    try {
      const dateFilter = days === 'all' ? 
        new Date('2000-01-01') : 
        new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        totalReferrals,
        newReferrals,
        activeCodes,
        totalCodes,
        topReferrers
      ] = await Promise.all([
        User.query().whereNotNull('referred_by').count('* as count').first(),
        User.query()
          .whereNotNull('referred_by')
          .where('created_at', '>=', dateFilter)
          .count('* as count')
          .first(),
        User.query()
          .whereNotNull('referral_code')
          .where('is_active', true)
          .count('* as count')
          .first(),
        User.query().whereNotNull('referral_code').count('* as count').first(),
        User.query()
          .select('id', 'first_name', 'last_name', 'referral_count', 'email')
          .whereNotNull('referral_code')
          .where('referral_count', '>', 0)
          .orderBy('referral_count', 'desc')
          .limit(10)
      ]);

      const totalRegistered = await User.query().count('* as count').first();
      const conversionRate = totalRegistered.count > 0 ? 
        (totalReferrals.count / totalRegistered.count) * 100 : 0;

      const averageReferralsPerUser = activeCodes.count > 0 ? 
        totalReferrals.count / activeCodes.count : 0;

      return {
        totalReferrals: totalReferrals.count,
        newReferrals: newReferrals.count,
        activeCodes: activeCodes.count,
        totalCodes: totalCodes.count,
        conversionRate: Math.round(conversionRate * 100) / 100,
        averageReferralsPerUser: Math.round(averageReferralsPerUser * 100) / 100,
        topReferrers: topReferrers.map(user => ({
          id: user.id,
          name: `${user.first_name} ${user.last_name}`,
          email: user.email,
          count: user.referral_count
        }))
      };
    } catch (error) {
      console.error('Referral stats error:', error);
      return {};
    }
  }

  // Activity monitoring
  static async getActivityStats() {
    try {
      const [
        activeToday,
        activeWeek,
        activeMonth,
        newRegistrationsToday,
        newRegistrationsWeek,
        totalAppointments
      ] = await Promise.all([
        User.query()
          .where('last_activity_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        User.query()
          .where('last_activity_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        User.query()
          .where('last_activity_at', '>=', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        User.query()
          .where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        User.query()
          .where('created_at', '>=', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
          .count('* as count')
          .first(),
        Appointment.query().count('* as count').first()
      ]);

      return {
        activeToday: activeToday.count,
        activeWeek: activeWeek.count,
        activeMonth: activeMonth.count,
        newRegistrationsToday: newRegistrationsToday.count,
        newRegistrationsWeek: newRegistrationsWeek.count,
        totalAppointments: totalAppointments.count
      };
    } catch (error) {
      console.error('Activity stats error:', error);
      return {};
    }
  }

  // User search and filtering
  static async searchUsers(filters = {}) {
    try {
      const {
        search,
        role,
        approval_status,
        registration_source,
        has_telegram,
        date_from,
        date_to,
        page = 1,
        limit = 50,
        sort_by = 'created_at',
        sort_order = 'desc'
      } = filters;

      let query = User.query();

      // Search filter
      if (search) {
        query = query.where(builder => {
          builder
            .where('email', 'ilike', `%${search}%`)
            .orWhere('first_name', 'ilike', `%${search}%`)
            .orWhere('last_name', 'ilike', `%${search}%`)
            .orWhere('telegram_username', 'ilike', `%${search}%`);
        });
      }

      // Role filter
      if (role && role !== 'all') {
        query = query.where('role', role);
      }

      // Approval status filter
      if (approval_status && approval_status !== 'all') {
        query = query.where('approval_status', approval_status);
      }

      // Registration source filter
      if (registration_source && registration_source !== 'all') {
        query = query.where('registration_source', registration_source);
      }

      // Telegram connection filter
      if (has_telegram === 'true') {
        query = query.whereNotNull('telegram_id');
      } else if (has_telegram === 'false') {
        query = query.whereNull('telegram_id');
      }

      // Date range filter
      if (date_from) {
        query = query.where('created_at', '>=', new Date(date_from));
      }
      if (date_to) {
        query = query.where('created_at', '<=', new Date(date_to));
      }

      // Count total results
      const totalCount = await query.clone().count('* as count').first();

      // Apply pagination and sorting
      const users = await query
        .orderBy(sort_by, sort_order)
        .limit(limit)
        .offset((page - 1) * limit);

      return {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(totalCount.count),
          pages: Math.ceil(totalCount.count / limit)
        }
      };
    } catch (error) {
      console.error('Search users error:', error);
      throw error;
    }
  }

  // User activity tracking
  static async getUserActivity(userId, days = 30) {
    try {
      const user = await User.query().findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const dateFilter = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        appointments,
        referrals
      ] = await Promise.all([
        Appointment.query()
          .where(builder => {
            builder.where('client_id', userId).orWhere('provider_id', userId);
          })
          .where('created_at', '>=', dateFilter)
          .orderBy('created_at', 'desc')
          .limit(20),
        User.query()
          .where('referred_by', userId)
          .select('id', 'first_name', 'last_name', 'email', 'created_at', 'approval_status')
          .orderBy('created_at', 'desc')
      ]);

      return {
        user: user.toJSON(),
        appointments,
        referrals,
        summary: {
          totalAppointments: appointments.length,
          totalReferrals: referrals.length,
          botInteractionCount: user.bot_interaction_count || 0,
          lastActivity: user.last_activity_at
        }
      };
    } catch (error) {
      console.error('Get user activity error:', error);
      throw error;
    }
  }

  // Action logging
  static async logUserAction(action, userId, adminId, metadata = {}) {
    try {
      // This would integrate with your audit logging system
      // For now, we'll just log to console
      console.log('User action logged:', {
        action,
        userId,
        adminId,
        metadata,
        timestamp: new Date()
      });
      
      return true;
    } catch (error) {
      console.error('Log user action error:', error);
      return false;
    }
  }

  // Role management
  static async changeUserRole(userId, newRole, changedBy) {
    try {
      const user = await User.query().findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const oldRole = user.role;
      
      await User.query().findById(userId).patch({
        role: newRole,
        updated_at: new Date()
      });

      await UserManagementService.logUserAction(
        'role_changed',
        userId,
        changedBy,
        { oldRole, newRole }
      );

      return await User.query().findById(userId);
    } catch (error) {
      console.error('Change user role error:', error);
      throw error;
    }
  }

  // User deactivation/activation
  static async toggleUserActiveStatus(userId, changedBy) {
    try {
      const user = await User.query().findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const newStatus = !user.is_active;
      
      await User.query().findById(userId).patch({
        is_active: newStatus,
        updated_at: new Date()
      });

      await UserManagementService.logUserAction(
        newStatus ? 'user_activated' : 'user_deactivated',
        userId,
        changedBy,
        { previousStatus: user.is_active, newStatus }
      );

      return await User.query().findById(userId);
    } catch (error) {
      console.error('Toggle user active status error:', error);
      throw error;
    }
  }
}

module.exports = UserManagementService;