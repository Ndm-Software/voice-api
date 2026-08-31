import { PushNotificationService } from './push-notification.service';

jest.mock('firebase-admin/app', () => ({
  applicationDefault: jest.fn(() => 'application-default'),
  getApps: jest.fn(() => []),
  initializeApp: jest.fn(),
}));

jest.mock('firebase-admin/messaging', () => {
  const send = jest.fn();

  return {
    send,
    getMessaging: jest.fn(() => ({ send })),
  };
});

const appMock = jest.requireMock('firebase-admin/app') as unknown as {
  applicationDefault: jest.Mock;
  getApps: jest.Mock;
  initializeApp: jest.Mock;
};
const messagingMock = jest.requireMock(
  'firebase-admin/messaging',
) as unknown as {
  getMessaging: jest.Mock;
  send: jest.Mock;
};
const mockApplicationDefault = appMock.applicationDefault;
const mockGetApps = appMock.getApps;
const mockGetMessaging = messagingMock.getMessaging;
const mockInitializeApp = appMock.initializeApp;
const mockSend = messagingMock.send;

describe('PushNotificationService', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockInitializeApp.mockReset();
    mockApplicationDefault.mockReturnValue('application-default');
    mockGetApps.mockReturnValue([]);
    mockGetMessaging.mockReturnValue({ send: mockSend });
  });

  it('initializes Firebase and sends a notification to a device', async () => {
    mockSend.mockResolvedValue('message-id');
    const service = new PushNotificationService();

    await expect(
      service.sendToDevice(
        'push-token',
        'Reminder title',
        'Reminder body',
        'reminder-id',
      ),
    ).resolves.toEqual({
      success: true,
      messageId: 'message-id',
    });

    expect(mockInitializeApp).toHaveBeenCalledWith({
      credential: 'application-default',
    });
    expect(mockSend).toHaveBeenCalledWith({
      token: 'push-token',
      notification: {
        title: 'Reminder title',
        body: 'Reminder body',
      },
      data: {
        reminderId: 'reminder-id',
      },
    });
  });

  it('returns the Firebase error without throwing', async () => {
    mockSend.mockRejectedValue(new Error('Firebase unavailable'));
    const service = new PushNotificationService();

    await expect(
      service.sendToDevice('push-token', 'Title', 'Body', 'reminder-id'),
    ).resolves.toEqual({
      success: false,
      error: 'Firebase unavailable',
    });
  });
});
