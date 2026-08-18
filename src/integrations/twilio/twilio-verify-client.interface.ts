export interface TwilioVerificationResource {
  status: string;
}

export interface TwilioVerifyService {
  verifications: {
    create(input: {
      to: string;
      channel: 'sms';
    }): Promise<TwilioVerificationResource>;
  };
  verificationChecks: {
    create(input: {
      to: string;
      code: string;
    }): Promise<TwilioVerificationResource>;
  };
}

export interface TwilioVerifyClient {
  verify: {
    v2: {
      services(serviceSid: string): TwilioVerifyService;
    };
  };
}
