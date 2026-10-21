import { parseWgConfig } from '../config/parse';
import { CANONICAL_KEYS, DEFAULT_KEEPALIVE, DISCORD_ALLOWED_IPS, DISCORD_REJECT_V6 } from '../config/rewrite';

export type PhonePlatform = 'ios' | 'android';

export const PHONE_DEVICE_NAME: Record<PhonePlatform, string> = {
  ios: 'GoLiveBypass-iPhone',
  android: 'GoLiveBypass-Android',
};

function pick(lines: string[], keys: Record<string, string>): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const key = keys[line.slice(0, i).trim().toLowerCase()];
    if (key) out.push(`${key} = ${line.slice(i + 1).trim()}`);
  }
  return out;
}

const has = (lines: string[], key: string) => lines.some(l => l.startsWith(`${key} =`));

/**
 * iPhone: split por IP como no Mac, com o IPv6 da Cloudflare num buraco negro
 * (a conf Free não tem IPv6) para o Discord cair no IPv4 tunelado.
 * Android: túnel só do app do Discord, que então precisa do DNS do Proton.
 */
export function buildPhoneConf(raw: string, platform: PhonePlatform): { ok: true; conf: string } | { ok: false; error: 'invalid_conf' } {
  const parsed = parseWgConfig(raw);
  const android = platform === 'android';
  const iface = pick(parsed.interfaceLines, android ? { ...CANONICAL_KEYS, dns: 'DNS' } : CANONICAL_KEYS);
  const peer = pick(parsed.peerLines, CANONICAL_KEYS);
  if (!has(iface, 'PrivateKey') || !has(iface, 'Address') || !has(peer, 'PublicKey') || !has(peer, 'Endpoint')) {
    return { ok: false, error: 'invalid_conf' };
  }
  if (android) iface.push('IncludedApplications = com.discord');
  if (!has(peer, 'PersistentKeepalive')) peer.push(`PersistentKeepalive = ${DEFAULT_KEEPALIVE}`);
  const allowed = android ? '0.0.0.0/0, ::/0' : [DISCORD_ALLOWED_IPS, ...DISCORD_REJECT_V6].join(', ');
  return { ok: true, conf: ['[Interface]', ...iface, '', '[Peer]', ...peer, `AllowedIPs = ${allowed}`, ''].join('\n') };
}
