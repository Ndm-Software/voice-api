export class UnsupportedPollyLanguageError extends Error {
  constructor() {
    super('Polly supports only TR and EN languages');
    this.name = UnsupportedPollyLanguageError.name;
  }
}
