import { describe, it, expect } from 'vitest';
import { defaultRouteIsUtun, deriveStateFromRoute } from '../../src/main/tunnel/status';

describe('status parsers', () => {
  it('detecta rota padrão via utun', () => {
    const net = 'Destination        Gateway            Flags\ndefault            link#14            UCSg      utun4';
    expect(defaultRouteIsUtun(net)).toBe(true);
  });
  it('rota padrão normal não é utun', () => {
    expect(defaultRouteIsUtun('default            192.168.0.1        UGScg     en0')).toBe(false);
  });
});

describe('deriveStateFromRoute', () => {
  it('rota utun → active; caso contrário inactive (reusa a máquina de estado)', () => {
    expect(deriveStateFromRoute('default  link#14  UCSg  utun4')).toBe('active');
    expect(deriveStateFromRoute('default  192.168.0.1  UGScg  en0')).toBe('inactive');
  });
});
