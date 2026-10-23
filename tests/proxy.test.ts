import { describe, expect, it } from 'vitest';
import { forwardedClientIp } from '../server/app';

describe('forwardedClientIp', () => {
  it('uses the entry appended by the trusted proxy, not client-supplied ones', () => {
    expect(forwardedClientIp('203.0.113.9')).toBe('203.0.113.9');
    // A client sending its own header cannot choose the IP used for rate limiting.
    expect(forwardedClientIp('1.2.3.4, 203.0.113.9')).toBe('203.0.113.9');
    expect(forwardedClientIp(' 1.2.3.4 ,  203.0.113.9 ')).toBe('203.0.113.9');
    expect(forwardedClientIp(['1.2.3.4', '203.0.113.9'])).toBe('203.0.113.9');
  });

  it('returns null when there is nothing usable', () => {
    expect(forwardedClientIp(undefined)).toBeNull();
    expect(forwardedClientIp('')).toBeNull();
    expect(forwardedClientIp(' , ')).toBeNull();
  });
});
