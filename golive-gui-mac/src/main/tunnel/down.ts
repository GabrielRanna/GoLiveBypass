import type { PrivilegedError } from '../../shared/types';
import type { ActivationOpts } from './activation';
import { runDeactivation } from './activation';

export interface DeactivateDeps {
  opts: ActivationOpts;
  restartDiscord(): Promise<void>;
}

export async function deactivate(d: DeactivateDeps): Promise<{ state: 'inactive' } | { error: PrivilegedError }> {
  const r = await runDeactivation(d.opts);
  if (!r.ok) return { error: r.error ?? 'wg_failed' };
  await d.restartDiscord();
  return { state: 'inactive' };
}
