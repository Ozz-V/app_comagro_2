/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/services/**/*.ts',
    'src/utils/**/*.ts',
    'src/hooks/**/*.ts',
    'src/contexts/**/*.{ts,tsx}',
    '!src/**/*.d.ts'
  ],
  // FIX (auditoría 2026-09-17): la cobertura subió drásticamente (63% en líneas)
  // gracias a la cobertura en módulos clave. Subimos el umbral para acompañar
  // el nuevo piso real.
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 40,
      functions: 50,
      lines: 55,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
