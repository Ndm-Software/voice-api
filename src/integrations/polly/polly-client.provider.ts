import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PollyClient } from '@aws-sdk/client-polly';

import { POLLY_CLIENT, POLLY_MAX_ATTEMPTS } from './polly.constants';

const createMockPollyClient = (): PollyClient =>
  ({
    send: () =>
      Promise.resolve({
        AudioStream: {
          transformToByteArray: () =>
            Promise.resolve(Buffer.from('MOCK_POLLY_AUDIO_DATA')),
        },
        ContentType: 'audio/mpeg',
      }),
    destroy: () => undefined,
  }) as unknown as PollyClient;

export const createPollyClient = (
  configService: ConfigService,
): PollyClient => {
  const isMockEnabled = configService.get<string>('POLLY_MOCK') === 'true';

  console.log('POLLY_MOCK:', isMockEnabled);

  if (isMockEnabled) {
    console.log('🧪 MOCK POLLY AKTİF');
    return createMockPollyClient();
  }

  console.log('☁️ GERÇEK AWS POLLY AKTİF');

  return new PollyClient({
    region: configService.getOrThrow<string>('aws.region'),
    maxAttempts: POLLY_MAX_ATTEMPTS,
  });
};

export const pollyClientProvider: Provider<PollyClient> = {
  provide: POLLY_CLIENT,
  inject: [ConfigService],
  useFactory: createPollyClient,
};
