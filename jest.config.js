/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/unit/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@mercora/shared-types$': '<rootDir>/src/common/shared-types/index.ts',
    '^@mercora/shared-types/(.*)$': '<rootDir>/src/common/shared-types/$1',
    '^@mercora/theme-config$': '<rootDir>/src/common/theme-config/index.ts',
    '^@mercora/theme-config/(.*)$': '<rootDir>/src/common/theme-config/$1',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/main.ts',
    '!src/database/migrations/**',
    '!src/scripts/**',
  ],
  coverageDirectory: './coverage/unit',
  testEnvironment: 'node',
  maxWorkers: 1,
};
