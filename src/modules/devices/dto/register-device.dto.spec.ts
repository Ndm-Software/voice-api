import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';

import { RegisterDeviceDto } from './register-device.dto';

const metadata: ArgumentMetadata = {
  type: 'body',
  metatype: RegisterDeviceDto,
};

describe('RegisterDeviceDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transform = async (
    body: Record<string, unknown>,
  ): Promise<RegisterDeviceDto> => {
    const result: unknown = await validationPipe.transform(body, metadata);

    return result as RegisterDeviceDto;
  };

  it('accepts a Windows device, trims text and allows a missing push token', async () => {
    const result = await transform({
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'WINDOWS',
      deviceName: '  Office Desktop  ',
    });

    expect(result).toEqual({
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'WINDOWS',
      deviceName: 'Office Desktop',
    });
  });

  it('trims a provided push token', async () => {
    const result = await transform({
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'ANDROID',
      deviceName: 'Pixel 8',
      pushToken: '  sample-token  ',
    });

    expect(result.pushToken).toBe('sample-token');
  });

  it('accepts null to clear the current push token', async () => {
    const result = await transform({
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'IOS',
      deviceName: 'iPhone',
      pushToken: null,
    });

    expect(result.pushToken).toBeNull();
  });

  it('normalizes an uppercase UUID to lowercase', async () => {
    const result = await transform({
      installationId: '550E8400-E29B-41D4-A716-446655440000',
      platform: 'WEB',
      deviceName: 'Browser',
    });

    expect(result.installationId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it.each([
    {
      installationId: 'invalid-uuid',
      platform: 'ANDROID',
      deviceName: 'Pixel 8',
    },
    {
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'LINUX',
      deviceName: 'Desktop',
    },
    {
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'IOS',
      deviceName: '   ',
    },
    {
      installationId: '550e8400-e29b-41d4-a716-446655440000',
      platform: 'WEB',
      deviceName: 'Browser',
      pushToken: 'x'.repeat(4097),
    },
  ])('rejects invalid device input', async (body) => {
    await expect(transform(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fields outside the API contract', async () => {
    await expect(
      transform({
        installationId: '550e8400-e29b-41d4-a716-446655440000',
        platform: 'IOS',
        deviceName: 'iPhone',
        userId: 42,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
