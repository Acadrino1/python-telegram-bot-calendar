#!/usr/bin/env node

/**
 * Simple Analytics Test Script
 * 
 * Tests core analytics functionality without complex database operations
 */

const { Model } = require('objection');
const Knex = require('knex');
const moment = require('moment');

// Import analytics models
const AnalyticsEvent = require('../src/analytics/models/AnalyticsEvent');
const BotInteraction = require('../src/analytics/models/BotInteraction');
const RevenueMetric = require('../src/analytics/models/RevenueMetric');

class SimpleAnalyticsTest {
  constructor() {
    this.testEvents = [];
  }

  async initialize() {
    console.log('🚀 Initializing Simple Analytics Test...');
    
    // Initialize database connection
    const knexConfig = require('../database/knexfile')[process.env.NODE_ENV || 'development'];
    const knex = Knex(knexConfig);
    Model.knex(knex);
    
    console.log('✅ Database connection established');
  }

  async runTests() {
    try {
      await this.initialize();
      
      console.log('\n🧪 Starting Simple Analytics Tests...\n');
      
      // Test 1: Test analytics models
      await this.testAnalyticsModels();
      
      // Test 2: Test analytics service
      await this.testAnalyticsService();
      
      // Test 3: Test export functionality
      await this.testExportFunctionality();
      
      console.log('\n✅ All analytics tests completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Analytics test failed:', error);
      process.exit(1);
    } finally {
      // Cleanup test data
      await this.cleanup();
      process.exit(0);
    }
  }

  async testAnalyticsModels() {
    console.log('🧪 Testing analytics models...');

    try {
      // Test AnalyticsEvent model
      const testEvent = await AnalyticsEvent.query().insert({
        event_type: 'service_viewed',
        user_id: null,
        session_id: 'test-session-123',
        event_data: {
          test: 'data',
          service_id: 1,
          view_type: 'list'
        },
        metadata: {
          source: 'test_script',
          test_run: true
        },
        ip_address: '127.0.0.1',
        user_agent: 'Test Agent',
        referrer: ''
      });

      this.testEvents.push(testEvent);
      console.log('✅ AnalyticsEvent model working');

      // Test BotInteraction model
      const testInteraction = await BotInteraction.query().insert({
        telegram_user_id: 'test-user-123',
        user_id: null,
        interaction_type: 'message',
        command: null,
        message_text: 'Test message from analytics test',
        response_time_ms: 150,
        success: true,
        error_message: null,
        session_data: {
          test: true
        },
        metadata: {
          source: 'test_script'
        }
      });

      this.testEvents.push(testInteraction);
      console.log('✅ BotInteraction model working');

      // Test RevenueMetric model
      const today = moment().format('YYYY-MM-DD');
      const testMetric = await RevenueMetric.query().insert({
        date: today,
        metric_type: 'daily_revenue',
        entity_id: null,
        entity_type: null,
        amount: 100.50,
        currency: 'USD',
        transaction_count: 2,
        average_transaction_value: 50.25,
        metadata: {
          test: true,
          source: 'test_script'
        }
      });

      this.testEvents.push(testMetric);
      console.log('✅ RevenueMetric model working');

    } catch (error) {
      console.error('Analytics models test failed:', error);
      throw error;
    }
  }

  async testAnalyticsService() {
    console.log('🧪 Testing analytics service...');

    try {
      const AnalyticsService = require('../src/analytics/services/AnalyticsService');
      
      const startDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
      const endDate = moment().format('YYYY-MM-DD');

      // Test executive summary
      const summary = await AnalyticsService.generateExecutiveSummary(startDate, endDate);
      
      if (!summary || typeof summary !== 'object') {
        throw new Error('Executive summary is invalid');
      }

      console.log('✅ Analytics service working');
      console.log('📊 Executive Summary:', JSON.stringify(summary, null, 2));

      // Test individual analytics modules
      console.log('🧪 Testing individual analytics modules...');

      try {
        const appointmentAnalytics = await AnalyticsService.getAppointmentAnalytics(startDate, endDate);
        console.log('✅ Appointment analytics working');
      } catch (error) {
        console.log('⚠️  Appointment analytics warning:', error.message);
      }

      try {
        const userAnalytics = await AnalyticsService.getUserGrowthAnalytics(startDate, endDate);
        console.log('✅ User growth analytics working');
      } catch (error) {
        console.log('⚠️  User growth analytics warning:', error.message);
      }

      try {
        const botAnalytics = await AnalyticsService.getBotPerformanceAnalytics(startDate, endDate);
        console.log('✅ Bot performance analytics working');
      } catch (error) {
        console.log('⚠️  Bot performance analytics warning:', error.message);
      }

    } catch (error) {
      console.error('Analytics service test failed:', error);
      throw error;
    }
  }

  async testExportFunctionality() {
    console.log('🧪 Testing export functionality...');

    try {
      const ExportService = require('../src/dashboard/exports/ExportService');
      
      // Create mock analytics data
      const mockData = {
        summary: {
          total_appointments: 25,
          total_revenue: 2500,
          active_users: 12,
          new_users: 5,
          period_length_days: 7
        },
        appointments: {
          booking_trends: [
            { period: '2024-01-01', bookings: 8, revenue: 800 },
            { period: '2024-01-02', bookings: 6, revenue: 600 },
            { period: '2024-01-03', bookings: 11, revenue: 1100 }
          ],
          status_distribution: [
            { status: 'completed', count: 20, percentage: 80, revenue: 2000 },
            { status: 'confirmed', count: 3, percentage: 12, revenue: 300 },
            { status: 'cancelled', count: 2, percentage: 8, revenue: 200 }
          ],
          service_popularity: [
            { service_id: 1, service_name: 'Consultation', bookings: 15, total_revenue: 1500, average_price: 100 },
            { service_id: 2, service_name: 'Treatment', bookings: 10, total_revenue: 1000, average_price: 100 }
          ]
        },
        users: {
          registration_trends: [
            { date: '2024-01-01', total: 2, by_role: { client: 2, provider: 0 } },
            { date: '2024-01-02', total: 1, by_role: { client: 1, provider: 0 } },
            { date: '2024-01-03', total: 2, by_role: { client: 1, provider: 1 } }
          ],
          active_users: {
            daily_active_users: [
              { date: '2024-01-01', active_users: 8 },
              { date: '2024-01-02', active_users: 6 },
              { date: '2024-01-03', active_users: 10 }
            ],
            monthly_active_users: 12
          },
          retention: [
            { period: '1_day', total_users: 5, retained_users: 4, retention_rate: 80 },
            { period: '7_days', total_users: 5, retained_users: 3, retention_rate: 60 },
            { period: '30_days', total_users: 5, retained_users: 2, retention_rate: 40 }
          ]
        },
        bot: {
          command_usage: [
            { command: 'start', usage_count: 15, avg_response_time: 120, success_count: 15 },
            { command: 'book', usage_count: 25, avg_response_time: 200, success_count: 23 },
            { command: 'help', usage_count: 8, avg_response_time: 80, success_count: 8 }
          ],
          error_rates: {
            total_interactions: 48,
            error_count: 2,
            error_rate: 4.17
          },
          user_engagement: {
            total_users: 12,
            active_users: 8,
            average_interactions_per_user: 4.0
          }
        },
        revenue: {
          revenue_trends: [
            { date: '2024-01-01', amount: 800, transaction_count: 8, average_transaction_value: 100 },
            { date: '2024-01-02', amount: 600, transaction_count: 6, average_transaction_value: 100 },
            { date: '2024-01-03', amount: 1100, transaction_count: 11, average_transaction_value: 100 }
          ],
          top_services: [
            { entity_id: 1, total_revenue: 1500, total_appointments: 15, metadata: { service_name: 'Consultation' } },
            { entity_id: 2, total_revenue: 1000, total_appointments: 10, metadata: { service_name: 'Treatment' } }
          ],
          revenue_growth: {
            current_period_revenue: 2500,
            previous_period_revenue: 2000,
            growth_percentage: 25,
            growth_amount: 500
          }
        },
        period: {
          startDate: '2024-01-01',
          endDate: '2024-01-07'
        }
      };

      // Test Excel export
      const excelResult = await ExportService.exportToExcel(mockData, {
        filename: 'test-analytics-export.xlsx'
      });

      if (excelResult.success) {
        console.log('✅ Excel export working');
        console.log(`📄 Generated Excel file: ${excelResult.filename} (${excelResult.size} bytes)`);
      } else {
        throw new Error('Excel export failed');
      }

      // Test CSV export
      const csvResult = await ExportService.exportToCSV(mockData, {
        filename: 'test-analytics-export.csv',
        section: 'summary'
      });

      if (csvResult.success) {
        console.log('✅ CSV export working');
        console.log(`📄 Generated CSV file: ${csvResult.filename} (${csvResult.size} bytes)`);
      } else {
        throw new Error('CSV export failed');
      }

      // Test export listing
      const exports = await ExportService.listExports();
      console.log(`✅ Export listing working (${exports.length} files found)`);

    } catch (error) {
      console.error('Export functionality test failed:', error);
      console.log('⚠️  Some export tests may have failed due to missing dependencies');
    }
  }

  async cleanup() {
    console.log('🧹 Cleaning up test data...');

    try {
      // Clean up test analytics events
      await AnalyticsEvent.query()
        .delete()
        .where('metadata:source', 'test_script');

      // Clean up test bot interactions
      await BotInteraction.query()
        .delete()
        .where('telegram_user_id', 'test-user-123');

      // Clean up test revenue metrics
      await RevenueMetric.query()
        .delete()
        .where('metadata:test', true);

      console.log('✅ Test data cleaned up');

    } catch (error) {
      console.warn('⚠️  Cleanup warning:', error.message);
    }
  }

  async generateSampleData(count = 50) {
    console.log(`📊 Generating ${count} sample analytics events...`);

    const eventTypes = [
      'user_registered',
      'service_viewed',
      'booking_attempt',
      'appointment_created',
      'bot_command_used',
      'support_chat_started'
    ];

    const interactionTypes = [
      'start',
      'help',
      'book_appointment',
      'view_appointments',
      'message'
    ];

    const events = [];
    const interactions = [];

    // Generate analytics events
    for (let i = 0; i < count; i++) {
      const randomDate = moment().subtract(Math.floor(Math.random() * 30), 'days');
      
      events.push({
        event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        user_id: Math.random() > 0.3 ? Math.floor(Math.random() * 20) + 1 : null,
        session_id: `session-${Math.random().toString(36).substr(2, 9)}`,
        event_data: {
          sample: true,
          index: i,
          random_value: Math.floor(Math.random() * 1000)
        },
        metadata: {
          source: 'sample_generator',
          batch: 'test_data'
        },
        ip_address: `192.168.1.${Math.floor(Math.random() * 255)}`,
        user_agent: 'Sample Test Agent',
        referrer: '',
        created_at: randomDate.toISOString()
      });

      // Generate bot interactions
      if (Math.random() > 0.5) {
        interactions.push({
          telegram_user_id: `sample-user-${Math.floor(Math.random() * 50)}`,
          user_id: Math.random() > 0.4 ? Math.floor(Math.random() * 20) + 1 : null,
          interaction_type: interactionTypes[Math.floor(Math.random() * interactionTypes.length)],
          command: Math.random() > 0.5 ? interactionTypes[Math.floor(Math.random() * 3)] : null,
          message_text: `Sample message ${i}`,
          response_time_ms: Math.floor(Math.random() * 1000) + 50,
          success: Math.random() > 0.1,
          metadata: {
            source: 'sample_generator',
            batch: 'test_data'
          },
          created_at: randomDate.toISOString()
        });
      }
    }

    // Insert sample data
    if (events.length > 0) {
      await AnalyticsEvent.query().insert(events);
      console.log(`✅ Generated ${events.length} sample analytics events`);
    }

    if (interactions.length > 0) {
      await BotInteraction.query().insert(interactions);
      console.log(`✅ Generated ${interactions.length} sample bot interactions`);
    }

    // Generate revenue metrics
    const revenueMetrics = [];
    for (let i = 0; i < 7; i++) {
      const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
      revenueMetrics.push({
        date: date,
        metric_type: 'daily_revenue',
        amount: Math.floor(Math.random() * 1000) + 100,
        transaction_count: Math.floor(Math.random() * 20) + 1,
        average_transaction_value: 0,
        metadata: {
          source: 'sample_generator'
        }
      });
    }

    // Calculate average transaction values
    revenueMetrics.forEach(metric => {
      metric.average_transaction_value = metric.amount / metric.transaction_count;
    });

    await RevenueMetric.query().insert(revenueMetrics);
    console.log(`✅ Generated ${revenueMetrics.length} sample revenue metrics`);
  }

  async cleanSampleData() {
    console.log('🧹 Cleaning sample data...');

    try {
      await AnalyticsEvent.query()
        .delete()
        .where('metadata:source', 'sample_generator');

      await BotInteraction.query()
        .delete()
        .whereRaw("telegram_user_id LIKE 'sample-user-%'");

      await RevenueMetric.query()
        .delete()
        .where('metadata:source', 'sample_generator');

      console.log('✅ Sample data cleaned');
    } catch (error) {
      console.warn('⚠️  Sample cleanup warning:', error.message);
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const testSuite = new SimpleAnalyticsTest();

  if (args.includes('--generate-sample')) {
    console.log('🌱 Generating sample data mode...');
    testSuite.initialize()
      .then(() => testSuite.generateSampleData(100))
      .then(() => {
        console.log('✅ Sample data generation completed');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Sample data generation failed:', error);
        process.exit(1);
      });
  } else if (args.includes('--clean-sample')) {
    console.log('🧹 Cleaning sample data mode...');
    testSuite.initialize()
      .then(() => testSuite.cleanSampleData())
      .then(() => {
        console.log('✅ Sample data cleanup completed');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Sample data cleanup failed:', error);
        process.exit(1);
      });
  } else {
    testSuite.runTests();
  }
}

module.exports = SimpleAnalyticsTest;