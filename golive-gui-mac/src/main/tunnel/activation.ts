import type { PrivilegedError } from '../../shared/types';
import { runViaHelper, installHelper, helperReady, type HelperAction } from '../privileged/helper';

export interface ActivationOpts {
  home: string;
  user: string;
  binDir: string;
  service: string;
  setV6Off: boolean;
}

function v6Args(action: HelperAction, opts: ActivationOpts): string[] {
  if (action === 'up'   && opts.setV6Off)  return ['--setv6off',  opts.service];
  if (action === 'down' && opts.setV6Off)  return ['--restorev6', opts.service];
  return [];
}

function classifyError(stderr: string): PrivilegedError {
  const s = stderr.toLowerCase();
  if (s.includes('user cancel') || s.includes('user cancelled')) return 'user_cancelled';
  if (s.includes('handshake_timeout'))                           return 'handshake_timeout';
  if (s.includes('command not found'))                           return 'binary_missing';
  return 'wg_failed';
}

async function ensureHelper(opts: ActivationOpts): Promise<{ ok: boolean; error?: PrivilegedError }> {
  if (helperReady(opts.user)) return { ok: true };
  const r = await installHelper(opts.home, opts.user, opts.binDir);
  if (!r.ok) {
    if (r.error === 'user_cancelled') return { ok: false, error: 'user_cancelled' };
    return { ok: false, error: 'wg_failed' };
  }
  return { ok: true };
}

export async function runActivation(
  opts: ActivationOpts,
): Promise<{ ok: boolean; error?: PrivilegedError }> {
  const install = await ensureHelper(opts);
  if (!install.ok) return install;
  const r = await runViaHelper('up', v6Args('up', opts));
  if (r.code === 0) return { ok: true };
  return { ok: false, error: classifyError(r.stderr) };
}

export async function runDeactivation(
  opts: ActivationOpts,
): Promise<{ ok: boolean; error?: PrivilegedError }> {
  const install = await ensureHelper(opts);
  if (!install.ok) return install;
  const r = await runViaHelper('down', v6Args('down', opts));
  if (r.code === 0) return { ok: true };
  return { ok: false, error: classifyError(r.stderr) };
}
