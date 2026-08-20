import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PollyClient } from '@aws-sdk/client-polly';

import { POLLY_CLIENT, POLLY_MAX_ATTEMPTS } from './polly.constants';

export const createPollyClient = (configService: ConfigService): PollyClient =>
  new PollyClient({
    region: configService.getOrThrow<string>('aws.region'),
    maxAttempts: POLLY_MAX_ATTEMPTS,
  });

export const pollyClientProvider: Provider<PollyClient> = {
  provide: POLLY_CLIENT,
  inject: [ConfigService],
  useFactory: createPollyClient,
};
