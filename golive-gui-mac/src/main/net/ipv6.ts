import { spawn } from 'child_process';

/**
 * Nome do serviço de rede ativo (não-privilegiado). Usado para montar o
 * `networksetup -setv6off/-setv6automatic` dentro do script elevado único.
 */
export function primaryService(): Promise<string> {
  return new Promise(resolve => {
    const p = spawn('sh', ['-c',
      `networksetup -listallnetworkservices | tail -n +2 | while read s; do ` +
      `networksetup -getinfo "$s" >/dev/null 2>&1 && echo "$s" && break; done`]);
    let out = '';
    p.stdout.on('data', d => (out += d.toString()));
    p.on('close', () => resolve(out.trim().split('\n')[0] || 'Wi-Fi'));
    p.on('error', () => resolve('Wi-Fi'));
  });
}
