const baseConfig = require('../jest.config');

/** @type {import('jest').Config} */
module.exports = {
  ...baseConfig,
  rootDir: '..',
  testRegex: 'test/integration/.*\\.int-spec\\.ts$',
  coverageDirectory: './coverage/integration',
  testTimeout: 30000,
};
