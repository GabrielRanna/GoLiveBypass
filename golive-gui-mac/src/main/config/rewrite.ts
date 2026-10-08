import type { WgConfig } from '../../shared/types';

/**
 * IPs usados pelos servidores de voz e gateway do Discord (Cloudflare anycast).
 * Split tunnel: apenas o tráfego do Discord passa pela VPN; outros apps (ex.: Sonobus)
 * continuam usando a conexão direta do usuário.
 *
 * Ranges cobertos:
 *   162.159.0.0/16  — Cloudflare (gateway.discord.gg, servidores de voz *.discord.media)
 *   104.16.0.0/12   — Cloudflare (104.16–104.31, CDN e mídia do Discord)
 */
export const DISCORD_ALLOWED_IPS = '162.159.0.0/16, 104.16.0.0/12';

/** Ranges IPv6 da Cloudflare rejeitados com o túnel ativo, para o Discord cair no IPv4 tunelado. */
export const DISCORD_REJECT_V6 = ['2606:4700::/32', '2a06:98c0::/29'];

export function rewriteForFullTunnel(
  c: WgConfig,
  opts: { defaultDns?: string } = {},
): { text: string; needsIpv6Off: boolean } {
  // DNS público da Cloudflare — acessível sem passar pelo túnel (1.1.1.1 não
  // está no DISCORD_ALLOWED_IPS), mantendo resolução de nomes para outros apps.
  const defaultDns = opts.defaultDns ?? '1.1.1.1, 1.0.0.1';

  const iface = [...c.interfaceLines];
  // Remove DNS que o ProtonVPN coloca (ex.: 10.2.0.1) e substitui pelo público
  const ifaceNoDns = iface.filter(l => !l.toLowerCase().startsWith('dns'));
  ifaceNoDns.push(`DNS = ${defaultDns}`);

  // Substitui AllowedIPs pelo split tunnel do Discord (sem ::/0 — IPv6 direto)
  const peer = c.peerLines.map(l =>
    l.toLowerCase().startsWith('allowedips')
      ? `AllowedIPs = ${DISCORD_ALLOWED_IPS}`
      : l,
  );
  if (!peer.some(l => l.toLowerCase().startsWith('allowedips'))) {
    peer.push(`AllowedIPs = ${DISCORD_ALLOWED_IPS}`);
  }

  const text = ['[Interface]', ...ifaceNoDns, '', '[Peer]', ...peer, ''].join('\n');
  // Com split tunnel IPv4-only não há leak de IPv6 pelo túnel — needsIpv6Off = false
  return { text, needsIpv6Off: false };
}
