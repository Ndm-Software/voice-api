import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PollyClient } from '@aws-sdk/client-polly';

import { POLLY_CLIENT } from './polly.constants';
import { PollyModule } from './polly.module';

describe('PollyModule', () => {
  it('provides one configured Polly client', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PollyModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: jest.fn().mockReturnValue('eu-central-1'),
      })
      .compile();

    const client = moduleRef.get<PollyClient>(POLLY_CLIENT);

    expect(client).toBeInstanceOf(PollyClient);
    await expect(client.config.region()).resolves.toBe('eu-central-1');

    const destroySpy = jest.spyOn(client, 'destroy');

    await moduleRef.close();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
