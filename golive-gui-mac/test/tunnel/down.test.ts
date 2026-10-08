import { describe, it, expect, vi } from 'vitest';
import { deactivate } from '../../src/main/tunnel/down';

describe('deactivate', () => {
  it('roda a desativação única e reinicia o Discord', async () => {
    const d = {
      runDeactivation: vi.fn(async () => ({ ok: true })),
      restartDiscord: vi.fn(async () => {}),
    };
    const r = await deactivate(d as any);
    expect(r).toEqual({ state: 'inactive' });
    expect(d.runDeactivation).toHaveBeenCalledTimes(1);
    expect(d.restartDiscord).toHaveBeenCalled();
  });

  it('falha na desativação propaga erro e não reinicia o Discord', async () => {
    const d = {
      runDeactivation: vi.fn(async () => ({ ok: false, error: 'user_cancelled' })),
      restartDiscord: vi.fn(async () => {}),
    };
    const r = await deactivate(d as any);
    expect(r).toEqual({ error: 'user_cancelled' });
    expect(d.restartDiscord).not.toHaveBeenCalled();
  });
});
