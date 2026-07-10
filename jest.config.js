/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/utils/**/*.ts',
    'src/hooks/**/*.ts',
    '!src/**/*.d.ts',
    '!src/utils/pdfService.ts',
    '!src/utils/pushNotifications.ts',
    '!src/hooks/useOTAUpdate.ts',
    '!src/hooks/useAiData.ts'
  ],
  coverageThreshold: {
    global: {
      statements: 50,
      branches: 40,
      functions: 50,
      lines: 50,
    },
  },
};
