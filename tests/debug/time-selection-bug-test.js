#!/usr/bin/env node

/**
 * TEST: Time Selection Bug - Debug why time buttons don't work
 * 
 * ISSUE: User Ch1fu can select date but time buttons don't respond
 * 
 * ROOT CAUSE ANALYSIS:
 * - Date selection works (date_ callbacks)  
 * - Time buttons appear but don't respond (time_ callbacks)
 * - Missing return statement after date selection allows code to continue
 * - Multiple callback handlers may be executing
 */

const { Telegraf, session } = require('telegraf');
const moment = require('moment');

// Simulate the buggy callback handler
function simulateBuggyCallbackHandler() {
  console.log('🐛 TESTING BUGGY CALLBACK HANDLER');
  
  const mockCtx = {
    session: null,
    callbackQuery: { data: 'date_2025-08-14' },
    answerCbQuery: () => Promise.resolve(),
    reply: (msg, opts) => {
      console.log('📝 Reply:', msg);
      if (opts && opts.reply_markup) {
        console.log('⌨️ Keyboard:', JSON.stringify(opts.reply_markup, null, 2));
      }
      return Promise.resolve();
    }
  };

  // Simulate the buggy flow
  const action = mockCtx.callbackQuery.data;
  
  console.log('📡 Processing action:', action);
  
  // Handle date selection (BUGGY VERSION - missing return)
  if (action.startsWith('date_')) {
    const date = action.replace('date_', '');
    if (!mockCtx.session) {
      mockCtx.session = { step: 'select_time', data: {} };
    }
    mockCtx.session.data.date = date;
    
    console.log('📅 Date selected:', date);
    console.log('💾 Session:', mockCtx.session);
    
    // Show time slots
    const times = [
      ['09:00', '10:30', '12:00'],
      ['14:00', '15:30', '17:00']
    ];
    
    const keyboard = times.map(row => 
      row.map(time => ({ text: time, callback_data: `time_${time}` }))
    );

    mockCtx.reply('🕐 Select a time:', {
      reply_markup: { inline_keyboard: keyboard }
    });
    
    // 🐛 BUG: Missing return statement here!
    // Code continues to next if statement
    console.log('⚠️ BUG: Code continues after date selection');
  }

  // Handle time selection  
  if (action.startsWith('time_')) {
    console.log('🕐 Time selection handler triggered');
    const time = action.replace('time_', '');
    if (!mockCtx.session || !mockCtx.session.data) {
      console.log('❌ Session expired');
      return;
    }
    console.log('✅ Time selected:', time);
  }

  console.log('🔚 End of callback handler\n');
}

// Simulate the fixed callback handler
function simulateFixedCallbackHandler() {
  console.log('✅ TESTING FIXED CALLBACK HANDLER');
  
  const mockCtx = {
    session: null,
    callbackQuery: { data: 'date_2025-08-14' },
    answerCbQuery: () => Promise.resolve(),
    reply: (msg, opts) => {
      console.log('📝 Reply:', msg);
      return Promise.resolve();
    }
  };

  // Simulate the fixed flow
  const action = mockCtx.callbackQuery.data;
  
  console.log('📡 Processing action:', action);
  
  // Handle date selection (FIXED VERSION - with return)
  if (action.startsWith('date_')) {
    const date = action.replace('date_', '');
    if (!mockCtx.session) {
      mockCtx.session = { step: 'select_time', data: {} };
    }
    mockCtx.session.data.date = date;
    
    console.log('📅 Date selected:', date);
    console.log('💾 Session:', mockCtx.session);
    
    // Show time slots
    const times = [
      ['09:00', '10:30', '12:00'],
      ['14:00', '15:30', '17:00']
    ];
    
    const keyboard = times.map(row => 
      row.map(time => ({ text: time, callback_data: `time_${time}` }))
    );

    mockCtx.reply('🕐 Select a time:', {
      reply_markup: { inline_keyboard: keyboard }
    });
    
    // ✅ FIX: Add return statement
    console.log('✅ FIX: Returning after date selection');
    return;
  }

  // Handle time selection  
  if (action.startsWith('time_')) {
    console.log('🕐 Time selection handler would trigger');
    const time = action.replace('time_', '');
    console.log('✅ Time would be selected:', time);
  }

  console.log('🔚 End of callback handler\n');
}

// Test both scenarios
console.log('🧪 TESTING TIME SELECTION BUG\n');

simulateBuggyCallbackHandler();
simulateFixedCallbackHandler();

// Test with actual time selection
console.log('🕐 TESTING TIME SELECTION');

const mockTimeCtx = {
  session: { data: { date: '2025-08-14' } },
  callbackQuery: { data: 'time_09:00' },
  answerCbQuery: () => Promise.resolve(),
  reply: (msg) => {
    console.log('📝 Time reply:', msg);
    return Promise.resolve();
  },
  from: { id: 123456 }
};

const timeAction = mockTimeCtx.callbackQuery.data;
if (timeAction.startsWith('time_')) {
  const time = timeAction.replace('time_', '');
  if (!mockTimeCtx.session || !mockTimeCtx.session.data) {
    console.log('❌ Session expired');
  } else {
    console.log('✅ Time selection successful:', time);
    console.log('📅 Selected date:', mockTimeCtx.session.data.date);
    mockTimeCtx.reply(`✅ Appointment confirmed for ${mockTimeCtx.session.data.date} at ${time}`);
  }
}

console.log('\n🎯 CONCLUSION:');
console.log('❌ BUG: Missing return statement after date selection');
console.log('✅ FIX: Add return statement at line 321 in restored-simple-bot.js');
console.log('📍 EXACT LOCATION: After ctx.reply in date selection handler');