export class InvalidTwilioVoiceCallError extends Error {
  constructor() {
    super('Voice call input is invalid');
    this.name = InvalidTwilioVoiceCallError.name;
  }
}

export class TwilioVoiceCallError extends Error {
  constructor() {
    super('Twilio voice call could not be started');
    this.name = TwilioVoiceCallError.name;
  }
}
