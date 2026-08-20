export const QUEUE_NAMES = {
  PUSH_NOTIFICATION: 'push-notification',
  VOICE_CALL: 'voice-call',
} as const;

export const JOB_NAMES = {
  SEND_PUSH_NOTIFICATION: 'send-push-notification',
  MAKE_VOICE_CALL: 'make-voice-call',
} as const;

export const VOICE_JOB_STATE_PREFIXES = {
  PROCESSING: 'processing:',
  ATTEMPTING: 'attempting:',
} as const;
