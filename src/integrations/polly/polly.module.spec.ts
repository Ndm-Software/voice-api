import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PollyClient } from '@aws-sdk/client-polly';

import { POLLY_CLIENT } from './polly.constants';
import { PollyModule } from './polly.module';
import { PollyService } from './polly.service';

const POLLY_SERVICE_CONSUMER = Symbol('POLLY_SERVICE_CONSUMER');

interface PollyServiceConsumer {
  pollyService: PollyService;
}

describe('PollyModule', () => {
  it('provides one configured client and exports PollyService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PollyModule],
      providers: [
        {
          provide: POLLY_SERVICE_CONSUMER,
          inject: [PollyService],
          useFactory: (pollyService: PollyService): PollyServiceConsumer => ({
            pollyService,
          }),
        },
      ],
    })
      .overrideProvider(ConfigService)
      .useValue({
        getOrThrow: jest.fn().mockReturnValue('eu-central-1'),
      })
      .compile();

    const client = moduleRef.get<PollyClient>(POLLY_CLIENT);
    const pollyService = moduleRef.get(PollyService);
    const consumer = moduleRef.get<PollyServiceConsumer>(
      POLLY_SERVICE_CONSUMER,
    );

    expect(client).toBeInstanceOf(PollyClient);
    await expect(client.config.region()).resolves.toBe('eu-central-1');
    expect(pollyService).toBeInstanceOf(PollyService);
    expect(consumer.pollyService).toBe(pollyService);

    const destroySpy = jest.spyOn(client, 'destroy');

    await moduleRef.close();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });
});
