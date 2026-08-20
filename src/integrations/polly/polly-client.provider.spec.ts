import { ConfigService } from '@nestjs/config';
import { PollyClient } from '@aws-sdk/client-polly';

import { createPollyClient } from './polly-client.provider';

describe('createPollyClient', () => {
  it('creates a client with the configured AWS region', async () => {
    const getOrThrow = jest.fn().mockReturnValue('eu-central-1');
    const configService = { getOrThrow } as unknown as ConfigService;
    const client = createPollyClient(configService);

    expect(client).toBeInstanceOf(PollyClient);
    await expect(client.config.region()).resolves.toBe('eu-central-1');
    expect(getOrThrow).toHaveBeenCalledWith('aws.region');

    client.destroy();
  });

  it('fails before creating a client when the AWS region is missing', () => {
    const configError = new Error('Missing configuration value: aws.region');
    const configService = {
      getOrThrow: jest.fn(() => {
        throw configError;
      }),
    } as unknown as ConfigService;

    expect(() => createPollyClient(configService)).toThrow(configError);
  });
});
