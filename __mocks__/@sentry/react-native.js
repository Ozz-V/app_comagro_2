// Mock manual de @sentry/react-native para tests.
// Jest usa automáticamente este archivo para cualquier import de
// '@sentry/react-native' en los tests, sin necesitar jest.mock() en cada
// archivo — así evitamos que Jest intente parsear el paquete real (que
// usa sintaxis / módulos nativos que rompen fuera de un runtime de RN).
module.exports = {
  init: jest.fn(),
  wrap: (component) => component,
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  captureEvent: jest.fn(),
  addBreadcrumb: jest.fn(),
  setTag: jest.fn(),
  setTags: jest.fn(),
  setUser: jest.fn(),
  setContext: jest.fn(),
  setExtra: jest.fn(),
  setExtras: jest.fn(),
  withScope: (fn) => fn({ setTag: jest.fn(), setExtra: jest.fn() }),
  ErrorBoundary: ({ children }) => children,
  wrapper: {},
};
