import { describe, it, expect, vi } from 'vitest';
import { makeRouter } from '../src/main/ipc';

describe('makeRouter', () => {
  it('encaminha tunnel:activate para o handler', async () => {
    const activate = vi.fn(async () => ({ state: 'active', publicIp: '1.2.3.4' }));
    const router = makeRouter({ activate, deactivate: vi.fn(), importConfig: vi.fn(), status: vi.fn() } as any);
    const r = await router('tunnel:activate', undefined);
    expect(activate).toHaveBeenCalled();
    expect(r).toEqual({ state: 'active', publicIp: '1.2.3.4' });
  });

  it('settings:set só repassa booleanos', async () => {
    const setSettings = vi.fn(async (p: unknown) => p);
    const router = makeRouter({ setSettings } as any);
    await router('settings:set', { openAtLogin: true, devMode: 'sim', extra: 1 });
    expect(setSettings).toHaveBeenCalledWith({ openAtLogin: true, devMode: undefined });
  });

  it('erro para canal desconhecido', async () => {
    const router = makeRouter({} as any);
    await expect(router('canal:invalido', undefined)).rejects.toThrow();
  });
});
