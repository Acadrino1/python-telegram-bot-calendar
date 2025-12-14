module.exports = async () => {
  console.log('🧹 Cleaning up integration tests...');
  
  try {
    if (global.testDb) {
      await global.testDb.destroy();
      console.log('✅ Test database connection closed');
    }
  } catch (error) {
    console.error('❌ Failed to cleanup test database:', error);
  }
  
  // Clean up global test variables
  delete global.testDb;
  
  console.log('✅ Integration test cleanup completed');
};
