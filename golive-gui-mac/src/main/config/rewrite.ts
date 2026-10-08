import type { WgConfig } from '../../shared/types';

export function rewriteForFullTunnel(
  c: WgConfig,
  opts: { defaultDns?: string } = {},
): { text: string; needsIpv6Off: boolean } {
  const defaultDns = opts.defaultDns ?? '1.1.1.1, 1.0.0.1';

  const iface = [...c.interfaceLines];
  if (!iface.some(l => l.toLowerCase().startsWith('dns'))) {
    iface.push(`DNS = ${defaultDns}`);
  }

  const peer = c.peerLines.map(l =>
    l.toLowerCase().startsWith('allowedips') ? 'AllowedIPs = 0.0.0.0/0, ::/0' : l,
  );
  if (!peer.some(l => l.toLowerCase().startsWith('allowedips'))) {
    peer.push('AllowedIPs = 0.0.0.0/0, ::/0');
  }

  const text = ['[Interface]', ...iface, '', '[Peer]', ...peer, ''].join('\n');
  return { text, needsIpv6Off: !c.hasIpv6Address };
}
