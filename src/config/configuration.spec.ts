import { configuration } from './configuration';

describe('configuration', () => {
  const originalNodeEnvironment = process.env.NODE_ENV;
  const originalTwimlUrl = process.env.TWILIO_TWIML_URL;

  afterEach(() => {
    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }

    if (originalTwimlUrl === undefined) {
      delete process.env.TWILIO_TWIML_URL;
    } else {
      process.env.TWILIO_TWIML_URL = originalTwimlUrl;
    }
  });

  it('normalizes the application environment used by cookie security', () => {
    process.env.NODE_ENV = ' Production ';

    expect(configuration().app.environment).toBe('production');
  });

  it('uses the Voice Call TwiML environment contract', () => {
    process.env.TWILIO_TWIML_URL = 'https://example.com/twiml';

    expect(configuration().twilio.twimlUrl).toBe('https://example.com/twiml');
  });
});
