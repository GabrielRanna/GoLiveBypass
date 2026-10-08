import { describe, it, expect } from 'vitest';
import { parseWgConfig } from '../../src/main/config/parse';
import { rewriteForFullTunnel } from '../../src/main/config/rewrite';

describe('rewriteForFullTunnel (split tunnel Discord)', () => {
  it('restringe AllowedIPs aos ranges do Discord e injeta DNS público', () => {
    const c = parseWgConfig(
      '[Interface]\nPrivateKey = a\nAddress = 10.0.0.2/32\nDNS = 10.2.0.1\n' +
      '[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0',
    );
    const { text, needsIpv6Off } = rewriteForFullTunnel(c);
    // Deve usar os ranges do Discord, não full-tunnel
    expect(text).toMatch(/AllowedIPs = 162\.159\.0\.0\/16, 104\.16\.0\.0\/12/);
    // DNS interno da ProtonVPN deve ser substituído pelo público
    expect(text).toMatch(/DNS = 1\.1\.1\.1, 1\.0\.0\.1/);
    expect(text).not.toMatch(/10\.2\.0\.1/);
    // Split tunnel IPv4-only não exige desligar IPv6 do sistema
    expect(needsIpv6Off).toBe(false);
  });

  it('substitui AllowedIPs mesmo quando conf não tinha IPv6', () => {
    const c = parseWgConfig(
      '[Interface]\nPrivateKey = a\nAddress = 10.0.0.2/32\n' +
      '[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 10.0.0.0/24',
    );
    const { text } = rewriteForFullTunnel(c);
    expect(text).toMatch(/AllowedIPs = 162\.159\.0\.0\/16, 104\.16\.0\.0\/12/);
    expect(text).not.toMatch(/0\.0\.0\.0\/0/);
  });

  it('nunca marca needsIpv6Off (split tunnel não precisa desligar IPv6)', () => {
    const c = parseWgConfig(
      '[Interface]\nPrivateKey = a\nAddress = fd00::2/128\n' +
      '[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 0.0.0.0/0',
    );
    const { needsIpv6Off } = rewriteForFullTunnel(c);
    expect(needsIpv6Off).toBe(false);
  });
});
