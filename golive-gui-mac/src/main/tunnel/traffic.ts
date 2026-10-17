import { spawn } from 'child_process';
import { DISCORD_ALLOWED_IPS } from '../config/rewrite';
import { netstatForms } from './status';

const DISCORD_ROUTES = new Set(DISCORD_ALLOWED_IPS.split(',').flatMap(netstatForms));

/** Interface utun por onde saem os ranges do Discord (`netstat -rn`). */
export function discordUtun(netstatRn: string): string | null {
  for (const l of netstatRn.split(/\r?\n/)) {
    const [dest, , , netif] = l.trim().split(/\s+/);
    if (dest && DISCORD_ROUTES.has(dest) && /^utun\d+$/.test(netif ?? '')) return netif;
  }
  return null;
}

export interface IfaceBytes { rx: number; tx: number }

/**
 * Bytes da interface em `netstat -ibn -I utunN` (não precisa de root). A linha
 * <Link#N> tem os contadores da interface; as linhas de endereço repetem os mesmos.
 */
export function parseIfaceBytes(out: string, iface: string): IfaceBytes | null {
  const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const header = lines[0]?.split(/\s+/) ?? [];
  const ib = header.indexOf('Ibytes');
  const ob = header.indexOf('Obytes');
  if (ib < 0 || ob < 0) return null;
  const row = lines.slice(1).map(l => l.split(/\s+/)).find(c => c[0] === iface && /^<Link#\d+>$/.test(c[2] ?? ''));
  if (!row) return null;
  // Sem endereço, a linha Link tem uma coluna a menos que o cabeçalho (Address vazio)
  const shift = header.length - row.length;
  const rx = Number(row[ib - shift]);
  const tx = Number(row[ob - shift]);
  return Number.isFinite(rx) && Number.isFinite(tx) ? { rx, tx } : null;
}

/** Mbps entre duas leituras; contador que voltou (túnel novo) vira null. */
export function rateMbps(prev: IfaceBytes, next: IfaceBytes, ms: number): { down: number; up: number } | null {
  if (ms <= 0 || next.rx < prev.rx || next.tx < prev.tx) return null;
  const f = 8 / (ms / 1000) / 1e6;
  return { down: (next.rx - prev.rx) * f, up: (next.tx - prev.tx) * f };
}

export function parsePingMs(out: string): number | null {
  const m = /time[=<]([\d.]+)\s*ms/.exec(out);
  return m ? Math.max(1, Math.round(Number(m[1]))) : null;
}

const capture = (cmd: string, args: string[]) =>
  new Promise<string>(res => {
    const p = spawn(cmd, args);
    let out = '';
    p.stdout.on('data', d => (out += d.toString()));
    p.on('close', () => res(out));
    p.on('error', () => res(''));
  });

export const readIfaceBytes = async (iface: string) =>
  parseIfaceBytes(await capture('/usr/sbin/netstat', ['-ibn', '-I', iface]), iface);

/** Ping até o gateway do Discord: o destino fica nos ranges tunelados, então mede o caminho real. */
export const pingThroughTunnel = async () =>
  parsePingMs(await capture('/sbin/ping', ['-c', '1', '-t', '3', 'gateway.discord.gg']));
