export interface TwilioVoiceCallResource {
  readonly sid: string;
  readonly status: string;
}

export interface TwilioVoiceClient {
  readonly calls: {
    create(input: {
      readonly to: string;
      readonly from: string;
      readonly twiml: string;
    }): Promise<TwilioVoiceCallResource>;
  };
}
