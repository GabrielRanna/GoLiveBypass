import { spawn } from 'child_process';
import { fetchPublicIp } from '../net/publicIp';

const capture = (cmd: string, args: string[]) =>
  new Promise<string>(res => {
    const p = spawn(cmd, args);
    let out = '';
    p.stdout.on('data', d => (out += d.toString()));
    p.on('close', () => res(out));
    p.on('error', () => res(''));
  });

/** Tabela de rotas atual (não-privilegiado), para derivar o estado do túnel. */
export function readDefaultRoute(): Promise<string> {
  return capture('netstat', ['-rn']);
}

export async function publicIp(): Promise<string | null> {
  const r = await fetchPublicIp(async () => {
    const res = await fetch('https://ifconfig.co/json');
    const j = (await res.json()) as { ip: string; country_iso?: string };
    return { ip: j.ip, country: j.country_iso };
  });
  return r?.ip ?? null;
}
