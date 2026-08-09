import { createCorsOptions } from './cors.config';

describe('createCorsOptions', () => {
  it('builds credentialed CORS options for the configured frontend', () => {
    expect(createCorsOptions(' http://localhost:3000 ')).toEqual({
      origin: 'http://localhost:3000',
      credentials: true,
    });
  });

  it.each([undefined, '', '   '])(
    'rejects a missing frontend URL (%s)',
    (frontendUrl) => {
      expect(() => createCorsOptions(frontendUrl)).toThrow(
        'FRONTEND_URL ortam değişkeni tanımlanmalıdır.',
      );
    },
  );
});
