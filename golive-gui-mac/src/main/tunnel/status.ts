import type { TunnelState } from '../../shared/types';
import { nextState } from '../state';

export function defaultRouteIsUtun(netstatRn: string): boolean {
  return netstatRn
    .split(/\r?\n/)
    .filter(l => /^default\b/.test(l.trim()))
    .some(l => /\butun\d+\b/.test(l));
}

/** Estado do túnel derivado da tabela de rotas (não-privilegiado). */
export function deriveStateFromRoute(netstatRn: string): TunnelState {
  return nextState('unknown', defaultRouteIsUtun(netstatRn) ? 'detected_tunnel' : 'detected_clean');
}
