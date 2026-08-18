import { normalizePhoneNumber } from './normalize-phone-number';

describe('normalizePhoneNumber', () => {
  it.each([
    ['05551112233', '+905551112233'],
    ['5551112233', '+905551112233'],
    ['+4915112345678', '+4915112345678'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });
});
