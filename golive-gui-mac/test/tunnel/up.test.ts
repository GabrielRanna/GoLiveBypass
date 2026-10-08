import { describe, it, expect, vi } from 'vitest';
import { activate } from '../../src/main/tunnel/up';

function baseDeps(over: Partial<any> = {}): any {
  return {
    runActivation: vi.fn(async () => ({ ok: true })),
    restartDiscord: vi.fn(async () => {}),
    publicIp: vi.fn(async () => '203.0.113.5'),
    ...over,
  };
}

describe('activate', () => {
  it('caminho feliz: roda a ativação única, reinicia Discord e reporta IP', async () => {
    const d = baseDeps();
    const r = await activate(d);
    expect(r).toEqual({ state: 'active', publicIp: '203.0.113.5' });
    expect(d.runActivation).toHaveBeenCalledTimes(1);
    expect(d.restartDiscord).toHaveBeenCalled();
  });

  it('falha na ativação propaga erro e NÃO reinicia o Discord', async () => {
    const d = baseDeps({ runActivation: vi.fn(async () => ({ ok: false, error: 'handshake_timeout' })) });
    const r = await activate(d);
    expect(r).toEqual({ error: 'handshake_timeout' });
    expect(d.restartDiscord).not.toHaveBeenCalled();
  });

  it('cancelamento do usuário é propagado', async () => {
    const d = baseDeps({ runActivation: vi.fn(async () => ({ ok: false, error: 'user_cancelled' })) });
    const r = await activate(d);
    expect(r).toEqual({ error: 'user_cancelled' });
  });
});
