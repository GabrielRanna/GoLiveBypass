import { describe, it, expect } from 'vitest';
import { readConfigState } from '../../src/main/config/store';

describe('readConfigState', () => {
  it('conf só-v4 armazenado → hasConfig true e needsIpv6Off true', () => {
    const text = '[Interface]\nPrivateKey = a\nAddress = 10.0.0.2/32\nDNS = 1.1.1.1\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0, ::/0';
    const r = readConfigState({ read: () => text });
    expect(r.hasConfig).toBe(true);
    expect(r.needsIpv6Off).toBe(true);
  });

  it('conf com IPv6 → needsIpv6Off false', () => {
    const text = '[Interface]\nPrivateKey = a\nAddress = fd00::2/128\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0, ::/0';
    const r = readConfigState({ read: () => text });
    expect(r.needsIpv6Off).toBe(false);
  });

  it('sem conf → hasConfig false', () => {
    const r = readConfigState({ read: () => null });
    expect(r.hasConfig).toBe(false);
  });
});
