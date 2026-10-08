import * as fs from 'fs';
import * as child_process from 'child_process';
import { promisify } from 'util';
import { DISCORD_ALLOWED_IPS, DISCORD_REJECT_V6 } from '../config/rewrite';

const execFile = promisify(child_process.execFile);

export const HELPER_DIR  = '/Library/PrivilegedHelperTools/GoLiveBypass';
export const HELPER_PATH = `${HELPER_DIR}/helper`;
const SUDOERS_PATH = '/etc/sudoers.d/golivebypass';
const SUDO_DENIED  = /sudo:\s*(no tty|a terminal|a password is required|password is required)/i;

export type HelperAction = 'up' | 'down';

interface ExecResult { code: number; stdout: string; stderr: string; }

async function execCmd(cmd: string, args: string[]): Promise<ExecResult> {
  try {
    const r = await execFile(cmd, args, { encoding: 'utf8', timeout: 90_000 }) as any;
    return { code: 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  } catch (e: any) {
    return { code: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? String(e.message ?? '') };
  }
}

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/**
 * Helper root. O conf do usuário é sanitizado (sem PostUp/DNS etc.) e o
 * AllowedIPs é sempre forçado para os ranges do Discord, qualquer que seja o
 * conf. Binários ficam numa pasta root-owned, nunca no bundle gravável do app.
 */
export function helperScript(): string {
  const D = HELPER_DIR;
  const v6 = DISCORD_REJECT_V6.join(' ');
  return `#!/bin/bash
# GoLiveBypass privileged helper v3 — não edite; gerado pelo app.
set -euo pipefail
export PATH='${D}/bin:/usr/bin:/bin:/usr/sbin:/sbin'
export WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go
umask 077

sudouser="\${SUDO_USER:-}"
case "$sudouser" in ''|root|*[!A-Za-z0-9._-]*) echo bad_user >&2; exit 64;; esac
home=$(dscl . -read "/Users/$sudouser" NFSHomeDirectory 2>/dev/null | awk '{print $2}')
[ -n "$home" ] && [ -d "$home" ] || { echo bad_home >&2; exit 64; }
src="$home/Library/Application Support/GoLiveBypass/golive.conf"
conf='${D}/golive.conf'
name_file=/var/run/wireguard/golive.name

sanitize() {
  [ -f "$src" ] && [ ! -L "$src" ] || { echo no_config >&2; exit 65; }
  awk -v allowed='${DISCORD_ALLOWED_IPS}' '
    /^\\[Interface\\]$/ {print; next}
    /^\\[Peer\\]$/ {print; print "AllowedIPs = " allowed; next}
    /^(PrivateKey|Address|ListenPort|MTU|PublicKey|PresharedKey|Endpoint|PersistentKeepalive) *=/ {print}
  ' "$src" > "$conf.tmp"
  mv -f "$conf.tmp" "$conf"
}

v6_reject_add() { for n in ${v6}; do route -q -n add -inet6 -net "$n" ::1 -reject >/dev/null 2>&1 || true; done; }
v6_reject_del() { for n in ${v6}; do route -q -n delete -inet6 -net "$n" ::1 -reject >/dev/null 2>&1 || true; done; }

case "\${1:-}" in
  up)
    sanitize
    wg-quick down "$conf" >/dev/null 2>&1 || true
    rm -f "$name_file" 2>/dev/null || true
    wg-quick up "$conf"
    real_iface=golive
    [ -f "$name_file" ] && real_iface="$(cat "$name_file")"

    ok=0
    for i in $(seq 1 15); do
      hs=$(wg show "$real_iface" latest-handshakes 2>/dev/null | awk '{print $2}' | head -1)
      if [ -n "$hs" ] && [ "$hs" != "0" ]; then ok=1; break; fi
      sleep 1
    done
    if [ "$ok" != "1" ]; then
      wg-quick down "$conf" || true
      echo handshake_timeout >&2; exit 2
    fi
    # Discord via IPv6 escaparia do túnel (IPv4-only): rejeita só os ranges dele
    v6_reject_add
    ;;

  down)
    v6_reject_del
    [ -f "$conf" ] || sanitize
    wg-quick down "$conf" || true
    ;;

  *) echo usage >&2; exit 64;;
esac
`;
}

function sudoersContent(user: string): string {
  return (
    `Defaults!${HELPER_PATH} !requiretty\n` +
    `${user} ALL=(root) NOPASSWD: ${HELPER_PATH} up, ${HELPER_PATH} down\n`
  );
}

/** Pronto = sudoers presente e helper root-owned com o conteúdo desta versão. */
export function helperReady(): boolean {
  try {
    if (!fs.existsSync(SUDOERS_PATH)) return false;
    const st = fs.statSync(HELPER_PATH);
    if (st.uid !== 0 || (st.mode & 0o022) !== 0) return false;
    return fs.readFileSync(HELPER_PATH, 'utf8') === helperScript();
  } catch { return false; }
}

/** Instala/atualiza helper, binários e sudoers via osascript (prompt de admin). */
export async function installHelper(
  user: string,
  binDir: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!/^[A-Za-z0-9._-]+$/.test(user)) return { ok: false, error: 'bad_user' };
  const installScript = `
set -e
mkdir -p ${shq(HELPER_DIR)}/bin
for b in wg wg-quick wireguard-go; do cp -f ${shq(binDir)}/"$b" ${shq(HELPER_DIR)}/bin/"$b"; done
chown -R root:wheel ${shq(HELPER_DIR)}
chmod 755 ${shq(HELPER_DIR)} ${shq(HELPER_DIR)}/bin ${shq(HELPER_DIR)}/bin/*
cat > ${shq(HELPER_PATH)} << 'HELPEREOF'
${helperScript()}HELPEREOF
chmod 755 ${shq(HELPER_PATH)}
chown root:wheel ${shq(HELPER_PATH)}
cat > ${shq(SUDOERS_PATH)}.tmp << 'SUDOERSEOF'
${sudoersContent(user)}SUDOERSEOF
chmod 440 ${shq(SUDOERS_PATH)}.tmp
chown root:wheel ${shq(SUDOERS_PATH)}.tmp
visudo -c -f ${shq(SUDOERS_PATH)}.tmp >/dev/null
mv -f ${shq(SUDOERS_PATH)}.tmp ${shq(SUDOERS_PATH)}
`;
  const b64 = Buffer.from(installScript).toString('base64');
  const osaCmd = `printf %s '${b64}' | base64 -D | bash 2>&1`;
  const r = await execCmd('osascript', ['-e', `do shell script "${osaCmd}" with administrator privileges`]);
  if (r.code !== 0) {
    const out = r.stdout + r.stderr;
    if (/user cancel|-128/i.test(out)) return { ok: false, error: 'user_cancelled' };
    return { ok: false, error: out.trim() || 'install_failed' };
  }
  return { ok: true };
}

/** Executa a ação via sudo -n (NOPASSWD); cai no prompt de admin se o sudo negar. */
export async function runViaHelper(
  action: HelperAction,
  user: string,
): Promise<{ code: number; stderr: string; usedPrompt: boolean }> {
  const r = await execCmd('/usr/bin/sudo', ['-n', HELPER_PATH, action]);
  if (r.code === 0) return { code: 0, stderr: r.stdout + r.stderr, usedPrompt: false };
  const out = r.stderr + r.stdout;
  if (!SUDO_DENIED.test(out)) return { code: r.code, stderr: out, usedPrompt: false };
  if (!/^[A-Za-z0-9._-]+$/.test(user)) return { code: 64, stderr: 'bad_user', usedPrompt: false };

  // Fora do sudo não há SUDO_USER; o helper usa-o para achar o conf do usuário
  const osaCmd = `SUDO_USER=${user} ${HELPER_PATH} ${action} 2>&1`;
  const o = await execCmd('osascript', ['-e', `do shell script "${osaCmd}" with administrator privileges`]);
  return { code: o.code, stderr: o.stdout + o.stderr, usedPrompt: true };
}
