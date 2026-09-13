import { describe, expect, it } from 'vitest';
import { isLuhnValid } from '../src/privacy/card-luhn';

describe('isLuhnValid', () => {
  it('accepts a valid card candidate and rejects arbitrary digits', () => {
    expect(isLuhnValid('4111 1111 1111 1111')).toBe(true);
    expect(isLuhnValid('4111 1111 1111 1112')).toBe(false);
  });
});
