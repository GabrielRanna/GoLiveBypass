export function shQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function buildWgQuickShell(
  action: 'up' | 'down',
  opts: { binDir: string; confPath: string },
): string {
  const env =
    `PATH=${opts.binDir}:/usr/bin:/bin:/usr/sbin:/sbin ` +
    `WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go`;
  return `${env} wg-quick ${action} ${shQuote(opts.confPath)}`;
}

export function buildOsascriptArgs(shellCmd: string): string[] {
  const asQuoted = `"${shellCmd.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return ['-e', `do shell script ${asQuoted} with administrator privileges`];
}

export interface ScriptOpts {
  binDir: string;
  confPath: string;
  iface: string;
  service: string;
  handshakeTimeoutSec: number;
}

const ENV_PREFIX = (binDir: string) =>
  `export PATH=${binDir}:/usr/bin:/bin:/usr/sbin:/sbin\n` +
  `export WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go\n`;

/**
 * Script único e elevado para Ativar: (opcional) desliga IPv6, sobe o túnel,
 * espera um handshake real (latest-handshakes != 0) e, se estourar o timeout,
 * derruba e restaura o IPv6 antes de sair com código != 0. Uma só elevação.
 */
export function buildActivateScript(opts: ScriptOpts & { setV6Off: boolean }): string {
  const conf = shQuote(opts.confPath);
  const iface = shQuote(opts.iface);
  const svc = shQuote(opts.service);
  const v6off = opts.setV6Off ? `networksetup -setv6off ${svc}\n` : '';
  const v6restore = opts.setV6Off ? `networksetup -setv6automatic ${svc}\n` : '';
  return (
    ENV_PREFIX(opts.binDir) +
    `set -e\n` +
    v6off +
    `wg-quick up ${conf}\n` +
    `ok=0\n` +
    `for i in $(seq 1 ${opts.handshakeTimeoutSec}); do\n` +
    `  hs=$(wg show ${iface} latest-handshakes 2>/dev/null | awk '{print $2}' | head -1)\n` +
    `  if [ -n "$hs" ] && [ "$hs" != "0" ]; then ok=1; break; fi\n` +
    `  sleep 1\n` +
    `done\n` +
    `if [ "$ok" != "1" ]; then\n` +
    `  wg-quick down ${conf} || true\n` +
    `  ${v6restore}` +
    `  echo handshake_timeout >&2\n` +
    `  exit 2\n` +
    `fi\n`
  );
}

/** Script único e elevado para Desativar: derruba o túnel e (opcional) restaura o IPv6. */
export function buildDeactivateScript(opts: ScriptOpts & { restoreV6: boolean }): string {
  const conf = shQuote(opts.confPath);
  const svc = shQuote(opts.service);
  const v6restore = opts.restoreV6 ? `networksetup -setv6automatic ${svc}\n` : '';
  return ENV_PREFIX(opts.binDir) + `wg-quick down ${conf}\n` + v6restore;
}
