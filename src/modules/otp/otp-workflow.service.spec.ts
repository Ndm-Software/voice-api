import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpChallenge, OtpChallengeStore } from './otp-challenge.store';
import { OtpSecurityService } from './otp-security.service';
import { OtpService } from './otp.service';
import { OtpWorkflowService } from './otp-workflow.service';

describe('OtpWorkflowService phone change', () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const currentPhoneNumber = '+905551110000';
  const newPhoneNumber = '+905551112233';
  const ipAddress = '203.0.113.10';
  const challenge: OtpChallenge = {
    version: 1,
    challengeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    purpose: 'PHONE_CHANGE',
    subject: userId,
    userId,
    phoneNumber: newPhoneNumber,
    createdAt: '2026-08-28T09:00:00.000Z',
  };

  const userFindUnique = jest.fn();
  const userUpdate = jest.fn();
  const otpService = {
    requestCode: jest.fn(),
    verifyCode: jest.fn(),
  };
  const otpSecurityService = {
    clearVerificationAttempts: jest.fn(),
    consumeSend: jest.fn(),
    consumeVerificationAttempt: jest.fn(),
    getResendCooldownSeconds: jest.fn(),
  };
  const challengeStore = {
    claim: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    find: jest.fn(),
    getExpiresInSeconds: jest.fn(),
    getRemainingSeconds: jest.fn(),
  };
  const service = new OtpWorkflowService(
    {
      user: {
        findUnique: userFindUnique,
        update: userUpdate,
      },
    } as unknown as PrismaService,
    otpService as unknown as OtpService,
    otpSecurityService as unknown as OtpSecurityService,
    challengeStore as unknown as OtpChallengeStore,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    challengeStore.claim.mockResolvedValue(true);
    challengeStore.create.mockResolvedValue(true);
    challengeStore.delete.mockResolvedValue(undefined);
    challengeStore.getExpiresInSeconds.mockReturnValue(600);
    challengeStore.getRemainingSeconds.mockReturnValue(540);
    otpService.requestCode.mockResolvedValue(undefined);
    otpService.verifyCode.mockResolvedValue(true);
    otpSecurityService.clearVerificationAttempts.mockResolvedValue(undefined);
    otpSecurityService.consumeSend.mockResolvedValue(undefined);
    otpSecurityService.consumeVerificationAttempt.mockResolvedValue({
      isFinalAttempt: false,
    });
    otpSecurityService.getResendCooldownSeconds.mockReturnValue(60);
    userUpdate.mockResolvedValue({ userId });
  });

  it('requests a code for an unused normalized phone number', async () => {
    userFindUnique
      .mockResolvedValueOnce({ phoneNumber: currentPhoneNumber })
      .mockResolvedValueOnce(null);

    await expect(
      service.requestPhoneChange(
        userId,
        { phoneNumber: '05551112233' },
        ipAddress,
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });

    expect(otpSecurityService.consumeSend).toHaveBeenCalledWith(
      newPhoneNumber,
      ipAddress,
    );
    expect(challengeStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 1,
        challengeId: expect.any(String) as unknown,
        purpose: 'PHONE_CHANGE',
        subject: userId,
        userId,
        phoneNumber: newPhoneNumber,
      }),
    );
    expect(otpService.requestCode).toHaveBeenCalledWith(newPhoneNumber);
  });

  it('rejects an unchanged phone number without sending a code', async () => {
    userFindUnique
      .mockResolvedValueOnce({ phoneNumber: newPhoneNumber })
      .mockResolvedValueOnce({ userId });

    await expect(
      service.requestPhoneChange(
        userId,
        { phoneNumber: newPhoneNumber },
        ipAddress,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(otpService.requestCode).not.toHaveBeenCalled();
  });

  it('masks a phone number owned by another user without sending a code', async () => {
    userFindUnique
      .mockResolvedValueOnce({ phoneNumber: currentPhoneNumber })
      .mockResolvedValueOnce({ userId: 'another-user' });

    await expect(
      service.requestPhoneChange(
        userId,
        { phoneNumber: newPhoneNumber },
        ipAddress,
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(challengeStore.create).not.toHaveBeenCalled();
    expect(otpService.requestCode).not.toHaveBeenCalled();
  });

  it('fails safely if the authenticated user no longer exists', async () => {
    userFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      service.requestPhoneChange(
        userId,
        { phoneNumber: newPhoneNumber },
        ipAddress,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps the reserved challenge available for resend when initial delivery fails', async () => {
    const providerError = new ServiceUnavailableException();
    userFindUnique
      .mockResolvedValueOnce({ phoneNumber: currentPhoneNumber })
      .mockResolvedValueOnce(null);
    otpService.requestCode.mockRejectedValueOnce(providerError);

    await expect(
      service.requestPhoneChange(
        userId,
        { phoneNumber: newPhoneNumber },
        ipAddress,
      ),
    ).rejects.toBe(providerError);
    expect(challengeStore.delete).not.toHaveBeenCalled();
  });

  it('does not overwrite an active phone-change challenge', async () => {
    userFindUnique
      .mockResolvedValueOnce({ phoneNumber: currentPhoneNumber })
      .mockResolvedValueOnce(null);
    challengeStore.create.mockResolvedValueOnce(false);

    const request = service.requestPhoneChange(
      userId,
      { phoneNumber: newPhoneNumber },
      ipAddress,
    );

    await expect(request).rejects.toBeInstanceOf(ConflictException);
    expect(otpService.requestCode).not.toHaveBeenCalled();
  });

  it('resends only the authenticated user matching pending challenge', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);
    userFindUnique.mockResolvedValueOnce(null);

    await expect(
      service.resendPhoneChange(
        userId,
        { phoneNumber: newPhoneNumber },
        ipAddress,
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 540,
    });

    expect(otpService.requestCode).toHaveBeenCalledWith(newPhoneNumber);
    expect(challengeStore.create).not.toHaveBeenCalled();
    expect(otpSecurityService.clearVerificationAttempts).not.toHaveBeenCalled();
  });

  it('does not send a new code when too little challenge time remains', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);
    challengeStore.getRemainingSeconds.mockReturnValueOnce(60);

    const error = await service
      .resendPhoneChange(userId, { phoneNumber: newPhoneNumber }, ipAddress)
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(otpService.requestCode).not.toHaveBeenCalled();
    expect(otpSecurityService.consumeSend).not.toHaveBeenCalled();
  });

  it('masks a phone ownership collision that appears before resend', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);
    userFindUnique.mockResolvedValueOnce({ userId: 'another-user' });

    await expect(
      service.resendPhoneChange(
        userId,
        { phoneNumber: newPhoneNumber },
        ipAddress,
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(challengeStore.delete).toHaveBeenCalledWith('PHONE_CHANGE', userId);
    expect(otpService.requestCode).not.toHaveBeenCalled();
  });

  it('does not send when resend input does not match the pending challenge', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);

    await expect(
      service.resendPhoneChange(
        userId,
        { phoneNumber: '+905559999999' },
        ipAddress,
      ),
    ).resolves.toEqual({
      message: 'Doğrulama kodu gönderildi.',
      expiresInSeconds: 600,
    });
    expect(otpService.requestCode).not.toHaveBeenCalled();
  });

  it('updates the phone only after a successful scoped and claimed verification', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);

    await expect(
      service.verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      }),
    ).resolves.toEqual({
      message: 'Telefon numarası başarıyla güncellendi.',
    });

    expect(otpSecurityService.consumeVerificationAttempt).toHaveBeenCalledWith(
      newPhoneNumber,
      `phone-change:${userId}`,
    );
    expect(challengeStore.claim).toHaveBeenCalledWith(challenge);
    expect(userUpdate).toHaveBeenCalledWith({
      where: { userId },
      data: {
        phoneNumber: newPhoneNumber,
        phoneVerified: true,
      },
    });
    expect(otpSecurityService.clearVerificationAttempts).toHaveBeenCalledWith(
      newPhoneNumber,
      `phone-change:${userId}`,
    );
  });

  it('deletes the challenge on the final invalid attempt', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);
    otpSecurityService.consumeVerificationAttempt.mockResolvedValueOnce({
      isFinalAttempt: true,
    });
    otpService.verifyCode.mockResolvedValueOnce(false);

    await expect(
      service.verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(challengeStore.delete).toHaveBeenCalledWith('PHONE_CHANGE', userId);
    expect(challengeStore.claim).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects verification when the challenge phone does not match', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);

    await expect(
      service.verifyPhoneChange(userId, {
        phoneNumber: '+905559999999',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(otpService.verifyCode).not.toHaveBeenCalled();
  });

  it('returns the stable error code for an expired challenge', async () => {
    challengeStore.find.mockResolvedValueOnce(null);

    const error = await service
      .verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) {
      throw new Error('Expected BadRequestException');
    }
    expect(error.getResponse()).toMatchObject({
      code: 'OTP_INVALID_OR_EXPIRED',
    });
    expect(otpService.verifyCode).not.toHaveBeenCalled();
  });

  it('cannot use another authenticated user pending challenge', async () => {
    const anotherUserId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    challengeStore.find.mockResolvedValueOnce(null);

    await expect(
      service.verifyPhoneChange(anotherUserId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(challengeStore.find).toHaveBeenCalledWith(
      'PHONE_CHANGE',
      anotherUserId,
    );
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects a replay when the challenge was already claimed', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);
    challengeStore.claim.mockResolvedValueOnce(false);

    const error = await service
      .verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    if (!(error instanceof BadRequestException)) {
      throw new Error('Expected BadRequestException');
    }
    expect(error.getResponse()).toMatchObject({
      code: 'OTP_INVALID_OR_EXPIRED',
    });
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('allows only one of two parallel verifies to claim and mutate the user', async () => {
    challengeStore.find.mockResolvedValue(challenge);
    challengeStore.claim
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const results = await Promise.allSettled([
      service.verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      }),
      service.verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(userUpdate).toHaveBeenCalledTimes(1);
  });

  it('maps a concurrent database uniqueness collision to a stable conflict', async () => {
    challengeStore.find.mockResolvedValueOnce(challenge);
    userUpdate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.9.1',
      }),
    );

    await expect(
      service.verifyPhoneChange(userId, {
        phoneNumber: newPhoneNumber,
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(challengeStore.delete).toHaveBeenCalledWith('PHONE_CHANGE', userId);
  });
});
