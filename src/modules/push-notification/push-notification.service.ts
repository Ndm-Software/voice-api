import { Injectable, Logger } from '@nestjs/common';

import {
  applicationDefault,
  getApps,
  initializeApp,
} from 'firebase-admin/app';

import {
  getMessaging,
  Message,
} from 'firebase-admin/messaging';

@Injectable()
export class PushNotificationService {
  private readonly logger =
    new Logger(PushNotificationService.name);

  constructor() {
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
      });

      this.logger.log(
        'Firebase Admin SDK başlatıldı.',
      );
    }
  }

  async sendToDevice(
    pushToken: string,
    title: string,
    body: string,
    reminderId: string,
  ) {
    try {
      const message: Message = {
        token: pushToken,

        notification: {
          title,
          body,
        },

        data: {
          reminderId,
        },
      };

      const response =
        await getMessaging().send(message);

      this.logger.log(
        `Push notification gönderildi. Message ID: ${response}`,
      );

      return {
        success: true,
        messageId: response,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown Firebase error';

      this.logger.error(
        `Push notification gönderilemedi: ${errorMessage}`,
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}