const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
  sort(tests) {
    // Run unit tests first, then integration tests
    const unitTests = tests.filter(test => test.path.includes('/unit/'));
    const integrationTests = tests.filter(test => test.path.includes('/integration/'));
    const otherTests = tests.filter(test => 
      !test.path.includes('/unit/') && !test.path.includes('/integration/')
    );
    
    return [
      ...this.sortByFilePath(unitTests),
      ...this.sortByFilePath(integrationTests), 
      ...this.sortByFilePath(otherTests)
    ];
  }

  sortByFilePath(tests) {
    return tests.sort((testA, testB) => (testA.path > testB.path ? 1 : -1));
  }
}

module.exports = CustomSequencer;