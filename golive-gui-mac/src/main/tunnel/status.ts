import type { TunnelState } from '../../shared/types';
import { nextState } from '../state';

// Prefixos de rede que o split tunnel roteia pelo utun (ranges Discord/Cloudflare)
const DISCORD_PREFIXES = ['162.159', '104.16', '104.17', '104.18', '104.19', '104.20', '104.21',
  '104.22', '104.23', '104.24', '104.25', '104.26', '104.27', '104.28', '104.29', '104.30', '104.31'];

export function defaultRouteIsUtun(netstatRn: string): boolean {
  // Split tunnel: verifica se alguma rota do Discord vai por utun (não a rota default)
  return netstatRn
    .split(/\r?\n/)
    .some(l => /\butun\d+\b/.test(l) && DISCORD_PREFIXES.some(p => l.includes(p)));
}

/** Estado do túnel derivado da tabela de rotas (não-privilegiado). */
export function deriveStateFromRoute(netstatRn: string): TunnelState {
  return nextState('unknown', defaultRouteIsUtun(netstatRn) ? 'detected_tunnel' : 'detected_clean');
}
