import { describe, it, expect } from 'vitest';
import { parseWgConfig } from '../../src/main/config/parse';
import { validateWgConfig } from '../../src/main/config/validate';

describe('validateWgConfig', () => {
  it('rejeita conf sem Endpoint', () => {
    const c = parseWgConfig('[Interface]\nPrivateKey = a\n[Peer]\nPublicKey = b');
    const r = validateWgConfig(c);
    expect(r.ok).toBe(false);
    expect(r.errors.join(' ')).toMatch(/Endpoint/);
  });

  it('aceita conf válido e avisa sobre DNS ausente', () => {
    const c = parseWgConfig('[Interface]\nPrivateKey = a\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0');
    const r = validateWgConfig(c);
    expect(r.ok).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/DNS/);
  });
});
