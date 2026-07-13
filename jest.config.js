// Unit tests for pure modules only. Screens/stores need jest-expo and are covered
// by integration/build checks instead.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/utils', '<rootDir>/src/services'],
  testMatch: ['**/__tests__/**/*.test.ts'],
};
