import { describe, it, expect } from 'vitest';
import { parseWgConfig } from '../../src/main/config/parse';

const SAMPLE = `[Interface]
PrivateKey = aaa
Address = 10.2.0.2/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = bbb
Endpoint = 203.0.113.9:51820
AllowedIPs = 0.0.0.0/0`;

describe('parseWgConfig', () => {
  it('separa interface/peer e extrai DNS', () => {
    const c = parseWgConfig(SAMPLE);
    expect(c.dns).toEqual(['1.1.1.1', '1.0.0.1']);
    expect(c.hasIpv6Address).toBe(false);
    expect(c.peerLines.some(l => l.startsWith('Endpoint'))).toBe(true);
  });

  it('detecta endereço IPv6', () => {
    const c = parseWgConfig('[Interface]\nAddress = fd00::2/128\n[Peer]\nEndpoint = x:1');
    expect(c.hasIpv6Address).toBe(true);
  });
});
