// Unit tests for pure modules only (src/utils). Screens/stores need jest-expo —
// out of scope until there's something to test there.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/utils'],
  testMatch: ['**/__tests__/**/*.test.ts'],
};
