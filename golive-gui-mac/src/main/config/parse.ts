import type { WgConfig } from '../../shared/types';

export function parseWgConfig(text: string): WgConfig {
  const lines = text.split(/\r?\n/).map(l => l.trim());
  const interfaceLines: string[] = [];
  const peerLines: string[] = [];
  const dns: string[] = [];
  let hasIpv6Address = false;
  let section: 'interface' | 'peer' | null = null;

  for (const line of lines) {
    if (line === '' || line.startsWith('#')) continue;
    const lower = line.toLowerCase();
    if (lower === '[interface]') { section = 'interface'; continue; }
    if (lower === '[peer]') { section = 'peer'; continue; }

    if (section === 'interface') {
      interfaceLines.push(line);
      if (lower.startsWith('address') && line.includes(':')) hasIpv6Address = true;
      if (lower.startsWith('dns')) {
        const v = line.split('=')[1] ?? '';
        v.split(',').map(s => s.trim()).filter(Boolean).forEach(s => dns.push(s));
      }
    } else if (section === 'peer') {
      peerLines.push(line);
    }
  }
  return { interfaceLines, peerLines, dns, hasIpv6Address };
}
