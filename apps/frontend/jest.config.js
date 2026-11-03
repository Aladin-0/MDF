const nextJest = require('next/jest');
const createJestConfig = nextJest({
  dir: './',
});
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Jest runs unit/component tests only. Playwright specs (*.spec.*, e2e/, tests/e2e/) belong to
  // `npm run test:e2e`; collecting them here made `jest` report dozens of bogus suite failures.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/e2e/',
    '/playwright-report/',
    '/test-results/',
    '\\.spec\\.(ts|tsx|js|jsx)$',
  ],
};

// next/jest replaces any transformIgnorePatterns given above with its own, so apply ours after it
// builds the config. ESM-only dependencies (uuid >= 12 ships `export` syntax) must be transformed
// or any suite that imports them fails to even parse.
const ESM_ONLY_DEPENDENCIES = ['uuid'];

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)();
  return {
    ...config,
    transformIgnorePatterns: [
      `/node_modules/(?!(${ESM_ONLY_DEPENDENCIES.join('|')})/)`,
      '^.+\\.module\\.(css|sass|scss)$',
    ],
  };
};
