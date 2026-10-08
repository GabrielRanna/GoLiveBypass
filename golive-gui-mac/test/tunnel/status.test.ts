import { describe, it, expect } from 'vitest';
import { defaultRouteIsUtun, deriveStateFromRoute } from '../../src/main/tunnel/status';

// Com split tunnel, a rota default permanece na en0; o utun aparece só para os ranges do Discord
const NET_SPLIT_ACTIVE = [
  'Destination        Gateway            Flags     Netif',
  'default            192.168.0.1        UGScg     en0',
  '162.159/16         10.2.0.1           UGSc      utun3',
  '104.16/12          10.2.0.1           UGSc      utun3',
].join('\n');

const NET_INACTIVE = [
  'Destination        Gateway            Flags     Netif',
  'default            192.168.0.1        UGScg     en0',
  '10.0.0/24          link#5             UCS       en0',
].join('\n');

describe('status parsers (split tunnel)', () => {
  it('detecta rotas do Discord via utun como túnel ativo', () => {
    expect(defaultRouteIsUtun(NET_SPLIT_ACTIVE)).toBe(true);
  });
  it('sem rotas Discord via utun → inativo', () => {
    expect(defaultRouteIsUtun(NET_INACTIVE)).toBe(false);
  });
  it('rota default via utun (full tunnel legado) também detecta como ativo', () => {
    const net = 'default            link#14            UCSg      utun4';
    expect(defaultRouteIsUtun(net)).toBe(false); // rota default sem prefixo Discord: não detecta
  });
});

describe('deriveStateFromRoute', () => {
  it('rotas Discord via utun → active', () => {
    expect(deriveStateFromRoute(NET_SPLIT_ACTIVE)).toBe('active');
  });
  it('sem rotas Discord → inactive', () => {
    expect(deriveStateFromRoute(NET_INACTIVE)).toBe('inactive');
  });
});
