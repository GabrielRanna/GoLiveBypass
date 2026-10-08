import { describe, it, expect, vi } from 'vitest';
import { importConfig } from '../../src/main/config/store';
import { appDataDir } from '../../src/main/paths';

describe('paths', () => {
  it('resolve o diretório de Application Support', () => {
    expect(appDataDir('/Users/bubu')).toBe('/Users/bubu/Library/Application Support/GoLiveBypass');
  });
});

describe('importConfig', () => {
  const valid = '[Interface]\nPrivateKey = a\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = b\nEndpoint = 1.2.3.4:51820\nAllowedIPs = 10.0.0.0/24';

  it('grava conf reescrito com mode 0600 e usa split tunnel Discord', () => {
    const write = vi.fn();
    const io = { write, mkdirp: vi.fn(), configPath: () => '/x/golive.conf' };
    const r = importConfig(valid, io);
    expect(r.ok).toBe(true);
    // Split tunnel: AllowedIPs restrito aos ranges do Discord
    expect(write).toHaveBeenCalledWith(
      '/x/golive.conf',
      expect.stringContaining('162.159.0.0/16'),
      0o600,
    );
    // Com split tunnel não é necessário desligar IPv6 do sistema
    expect(r.needsIpv6Off).toBe(false);
  });

  it('não grava conf inválido', () => {
    const write = vi.fn();
    const io = { write, mkdirp: vi.fn(), configPath: () => '/x/golive.conf' };
    const r = importConfig('[Interface]\nPrivateKey = a', io);
    expect(r.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
