export class UnsupportedPollyLanguageError extends Error {
  constructor() {
    super('Polly supports only TR and EN languages');
    this.name = UnsupportedPollyLanguageError.name;
  }
}

export class InvalidPollyTextError extends Error {
  constructor() {
    super('Polly text must contain between 1 and 3000 characters');
    this.name = InvalidPollyTextError.name;
  }
}

export class PollySynthesisError extends Error {
  constructor() {
    super('Polly speech synthesis failed');
    this.name = PollySynthesisError.name;
  }
}
