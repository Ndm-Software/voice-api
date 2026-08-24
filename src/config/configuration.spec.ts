import { configuration } from './configuration';

describe('configuration', () => {
  const originalNodeEnvironment = process.env.NODE_ENV;

  afterEach(() => {
    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }

  });

  it('normalizes the application environment used by cookie security', () => {
    process.env.NODE_ENV = ' Production ';

    expect(configuration().app.environment).toBe('production');
  });

});
