import { describe, it, expect } from 'vitest';
import { parseWgConfig } from '../../src/main/config/parse';
import { rewriteForFullTunnel } from '../../src/main/config/rewrite';

describe('rewriteForFullTunnel', () => {
  it('força full-tunnel, injeta DNS e marca needsIpv6Off para conf só-v4', () => {
    const c = parseWgConfig('[Interface]\nPrivateKey = a\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 10.0.0.0/24');
    const { text, needsIpv6Off } = rewriteForFullTunnel(c);
    expect(text).toMatch(/AllowedIPs = 0\.0\.0\.0\/0, ::\/0/);
    expect(text).toMatch(/DNS = 1\.1\.1\.1, 1\.0\.0\.1/);
    expect(needsIpv6Off).toBe(true);
  });

  it('não marca needsIpv6Off quando há endereço IPv6', () => {
    const c = parseWgConfig('[Interface]\nPrivateKey = a\nAddress = fd00::2/128\nDNS = 9.9.9.9\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0');
    const { needsIpv6Off } = rewriteForFullTunnel(c);
    expect(needsIpv6Off).toBe(false);
  });
});
