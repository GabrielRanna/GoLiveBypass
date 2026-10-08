import { describe, it, expect } from 'vitest';
import { isBrazilIp, fetchPublicIp } from '../../src/main/net/publicIp';

describe('publicIp', () => {
  it('classifica BR', () => {
    expect(isBrazilIp({ country: 'BR' })).toBe(true);
    expect(isBrazilIp({ country: 'US' })).toBe(false);
  });
  it('fetch retorna ip + flag', async () => {
    const r = await fetchPublicIp(async () => ({ ip: '203.0.113.5', country: 'NL' }));
    expect(r).toEqual({ ip: '203.0.113.5', isBr: false });
  });
  it('fetch tolera erro retornando null', async () => {
    const r = await fetchPublicIp(async () => { throw new Error('net'); });
    expect(r).toBeNull();
  });
});
