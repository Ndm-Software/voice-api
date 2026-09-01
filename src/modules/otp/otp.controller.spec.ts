import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { OtpController } from './otp.controller';
import { OtpWorkflowService } from './otp-workflow.service';

describe('OtpController', () => {
  const user: AuthenticatedUser = {
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const workflow = {
    requestPhoneChange: jest.fn(),
    resendPhoneChange: jest.fn(),
    verifyPhoneChange: jest.fn(),
  };
  const controller = new OtpController(
    workflow as unknown as OtpWorkflowService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards the authenticated user and client IP for phone changes', async () => {
    workflow.requestPhoneChange.mockResolvedValueOnce({ message: 'sent' });

    await expect(
      controller.requestPhoneChange(
        user,
        { phoneNumber: '+905551112233' },
        '203.0.113.10',
      ),
    ).resolves.toEqual({ message: 'sent' });
    expect(workflow.requestPhoneChange).toHaveBeenCalledWith(
      user.userId,
      { phoneNumber: '+905551112233' },
      '203.0.113.10',
    );
  });

  it.each([
    ['requestPhoneChange', 'phone-change/request'],
    ['resendPhoneChange', 'phone-change/resend'],
    ['verifyPhoneChange', 'phone-change/verify'],
  ] as const)('exposes guarded POST %s at %s', (methodName, expectedPath) => {
    const handler = Object.getOwnPropertyDescriptor(
      OtpController.prototype,
      methodName,
    )?.value as unknown;
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(expectedPath);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.POST,
    );
  });

  it('uses the provider-neutral OTP route namespace', () => {
    expect(Reflect.getMetadata(PATH_METADATA, OtpController)).toBe('otp');
  });
});
