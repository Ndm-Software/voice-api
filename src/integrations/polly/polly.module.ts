import {
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PollyClient } from '@aws-sdk/client-polly';

import { pollyClientProvider } from './polly-client.provider';
import { POLLY_CLIENT } from './polly.constants';
import { PollyService } from './polly.service';

@Injectable()
class PollyClientLifecycle implements OnModuleDestroy {
  constructor(@Inject(POLLY_CLIENT) private readonly client: PollyClient) {}

  onModuleDestroy(): void {
    this.client.destroy();
  }
}

@Module({
  imports: [ConfigModule],
  providers: [pollyClientProvider, PollyClientLifecycle, PollyService],
  exports: [PollyService],
})
export class PollyModule {}
