import * as fs from 'fs';
import * as child_process from 'child_process';
import { promisify } from 'util';

const execFile = promisify(child_process.execFile);

export const HELPER_DIR  = '/Library/PrivilegedHelperTools/GoLiveBypass';
export const HELPER_PATH = `${HELPER_DIR}/helper`;
const SUDOERS_PATH = '/etc/sudoers.d/golivebypass';
const SUDO_DENIED  = /sudo:\s*(no tty|a terminal|password is required)/i;

export type HelperAction = 'up' | 'down';

interface ExecResult { code: number; stdout: string; stderr: string; }

async function execCmd(cmd: string, args: string[]): Promise<ExecResult> {
  try {
    const r = await execFile(cmd, args, { encoding: 'utf8', timeout: 90_000 }) as any;
    return { code: 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } catch (e: any) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Bash script instalado em /Library/PrivilegedHelperTools/GoLiveBypass/helper */
export function helperScript(home: string, binDir: string): string {
  const conf = shq(`${home}/Library/Application Support/GoLiveBypass/golive.conf`);
  return `#!/bin/bash
set -euo pipefail
ACTION="\${1:-}"
[ -z "$ACTION" ] && { echo "Uso: helper up|down [--setv6off SERVICE | --restorev6 SERVICE]" >&2; exit 1; }
V6_FLAG="\${2:-}"
V6_SVC="\${3:-}"
CONF=${conf}
IFACE=golive
export PATH=${shq(binDir)}:/usr/bin:/bin:/usr/sbin:/sbin
export WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go
_phys=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' | head -1 || true)
if [ "$ACTION" = "up" ]; then
  if [ "$V6_FLAG" = "--setv6off" ] && [ -n "$V6_SVC" ]; then
    networksetup -setv6off "$V6_SVC" 2>/dev/null || true
  fi
  wg-quick up "$CONF"
  ok=0
  for i in $(seq 1 15); do
    hs=$(wg show "$IFACE" latest-handshakes 2>/dev/null | awk '{print $2}' | head -1 || true)
    if [ -n "$hs" ] && [ "$hs" != "0" ]; then ok=1; break; fi
    sleep 1
  done
  if [ "$ok" != "1" ]; then
    wg-quick down "$CONF" || true
    if [ "$V6_FLAG" = "--setv6off" ] && [ -n "$V6_SVC" ]; then
      networksetup -setv6automatic "$V6_SVC" 2>/dev/null || true
    fi
    echo handshake_timeout >&2
    exit 2
  fi
elif [ "$ACTION" = "down" ]; then
  wg-quick down "$CONF" || true
  if [ "$V6_FLAG" = "--restorev6" ] && [ -n "$V6_SVC" ]; then
    networksetup -setv6automatic "$V6_SVC" 2>/dev/null || true
  fi
  if [ -n "$_phys" ]; then
    ifconfig "$_phys" inet6 2>/dev/null | awk '/inet6/{print $2}' | grep -v '^fe80' | sed 's/%.*$//' | \\
      while read -r _addr; do ifconfig "$_phys" inet6 "$_addr" -alias 2>/dev/null || true; done || true
  fi
else
  echo "Ação inválida: $ACTION" >&2; exit 1
fi
`;
}

function sudoersContent(user: string): string {
  return (
    `Defaults!${HELPER_PATH} !requiretty\n` +
    `${user} ALL=(root) NOPASSWD: ${HELPER_PATH} up, ${HELPER_PATH} down\n`
  );
}

/** Verifica se o helper está instalado e pertence a root (uid=0). */
export function helperReady(_user: string): boolean {
  try {
    if (!fs.existsSync(SUDOERS_PATH)) return false;
    if (!fs.existsSync(HELPER_PATH))  return false;
    const st = fs.statSync(HELPER_PATH);
    return st.uid === 0;
  } catch { return false; }
}

/** Instala o helper e configura sudoers via osascript (com prompt de admin). */
export async function installHelper(
  home: string,
  user: string,
  binDir: string,
): Promise<{ ok: boolean; error?: string }> {
  const script = helperScript(home, binDir);
  const sudoers = sudoersContent(user);
  const installScript = `
set -e
mkdir -p ${shq(HELPER_DIR)}
cat > ${shq(HELPER_PATH)} << 'HELPEREOF'
${script}
HELPEREOF
chmod 755 ${shq(HELPER_PATH)}
chown root:wheel ${shq(HELPER_PATH)}
cat > ${shq(SUDOERS_PATH)} << 'SUDOERSEOF'
${sudoers}
SUDOERSEOF
chmod 440 ${shq(SUDOERS_PATH)}
chown root:wheel ${shq(SUDOERS_PATH)}
visudo -c -f ${shq(SUDOERS_PATH)} 2>&1 || { rm -f ${shq(SUDOERS_PATH)}; exit 1; }
`;
  const b64 = Buffer.from(installScript).toString('base64');
  const osaCmd = `printf %s '${b64}' | base64 -D | bash 2>&1`;
  const r = await execCmd('osascript', ['-e', `do shell script "${osaCmd}" with administrator privileges`]);
  if (r.code !== 0) {
    const out = r.stdout + r.stderr;
    if (/user cancel/i.test(out)) return { ok: false, error: 'user_cancelled' };
    return { ok: false, error: out.trim() || 'install_failed' };
  }
  return { ok: true };
}

/**
 * Executa a ação privilegiada. Tenta primeiro sudo -n (sem prompt se NOPASSWD
 * estiver configurado), e cai de volta no osascript se falhar.
 */
export async function runViaHelper(
  action: HelperAction,
  extraArgs: string[] = [],
): Promise<{ code: number; stderr: string; usedPrompt: boolean }> {
  const ready = helperReady('');
  if (ready) {
    const r = await execCmd('/usr/bin/sudo', ['-n', HELPER_PATH, action, ...extraArgs]);
    if (r.code === 0) return { code: 0, stderr: '', usedPrompt: false };
    const out = r.stderr + r.stdout;
    // Se não foi negativa de sudo, foi erro real do helper — retorna direto
    if (out.trim() && !SUDO_DENIED.test(out))
      return { code: r.code, stderr: out, usedPrompt: false };
  }
  // Fallback: executa via osascript com prompt de senha
  const runScript = `${HELPER_PATH} ${action} ${extraArgs.map(shq).join(' ')}`;
  const b64 = Buffer.from(runScript).toString('base64');
  const osaCmd = `printf %s '${b64}' | base64 -D | bash 2>&1`;
  const r = await execCmd('osascript', ['-e', `do shell script "${osaCmd}" with administrator privileges`]);
  return { code: r.code, stderr: r.stdout + r.stderr, usedPrompt: true };
}
