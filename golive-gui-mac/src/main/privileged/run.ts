import type { PrivilegedError } from '../../shared/types';

export type ExecResult = { code: number | null; stdout: string; stderr: string };
export type ExecFn = (cmd: string, args: string[]) => Promise<ExecResult>;

export function classifyOsascriptError(code: number | null, stderr: string): PrivilegedError {
  const s = stderr.toLowerCase();
  if (code === -128 || s.includes('user canceled') || s.includes('user cancelled')) return 'user_cancelled';
  if (s.includes('command not found')) return 'binary_missing';
  return 'wg_failed';
}

export async function runPrivileged(
  args: string[],
  exec: ExecFn,
): Promise<{ ok: boolean; stdout: string; error?: PrivilegedError }> {
  const r = await exec('osascript', args);
  if (r.code === 0) return { ok: true, stdout: r.stdout };
  return { ok: false, stdout: r.stdout, error: classifyOsascriptError(r.code, r.stderr) };
}
