import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { LoginDto } from './login.dto';

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: LoginDto,
};

describe('LoginDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = async (
    body: Record<string, unknown>,
  ): Promise<LoginDto> => {
    const result: unknown = await validationPipe.transform(body, metadata);

    return result as LoginDto;
  };

  const validBody = {
    email: 'user@example.com',
    password: 'password123',
    installationId: '550e8400-e29b-41d4-a716-446655440000',
    platform: 'WEB',
    deviceName: 'Browser',
  };

  it.each(['WEB', 'ANDROID', 'IOS', 'WINDOWS'])(
    'accepts the supported %s platform',
    async (platform) => {
      const result = await transform({ ...validBody, platform });

      expect(result.platform).toBe(platform);
    },
  );

  it('accepts null when a client clears its push token during login', async () => {
    const result = await transform({ ...validBody, pushToken: null });

    expect(result.pushToken).toBeNull();
  });

  it.each(['MACOS', 'LINUX'])(
    'rejects the unsupported %s platform',
    async (platform) => {
      await expect(
        transform({ ...validBody, platform }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('rejects fields outside the login contract', async () => {
    await expect(
      transform({ ...validBody, phoneNumber: '+905551112233' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
