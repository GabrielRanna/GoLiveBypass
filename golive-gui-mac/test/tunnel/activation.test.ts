import { describe, it, expect } from 'vitest';
import { runActivation, runDeactivation } from '../../src/main/tunnel/activation';

const opts = { binDir: '/b', confPath: '/c/golive.conf', iface: 'golive', service: 'Wi-Fi', handshakeTimeoutSec: 15 };

describe('runActivation', () => {
  it('code 0 → ok', async () => {
    const exec = async () => ({ code: 0, stdout: '', stderr: '' });
    expect(await runActivation({ ...opts, setV6Off: true }, exec)).toEqual({ ok: true });
  });
  it('stderr com handshake_timeout → erro tipado', async () => {
    const exec = async () => ({ code: 2, stdout: '', stderr: 'handshake_timeout\n' });
    expect(await runActivation({ ...opts, setV6Off: true }, exec)).toEqual({ ok: false, error: 'handshake_timeout' });
  });
  it('cancelamento do usuário → user_cancelled', async () => {
    const exec = async () => ({ code: 1, stdout: '', stderr: 'User canceled.' });
    expect(await runActivation({ ...opts, setV6Off: false }, exec)).toEqual({ ok: false, error: 'user_cancelled' });
  });
});

describe('runDeactivation', () => {
  it('cancelamento → user_cancelled', async () => {
    const exec = async () => ({ code: 1, stdout: '', stderr: 'User cancelled.' });
    expect(await runDeactivation({ ...opts, restoreV6: true }, exec)).toEqual({ ok: false, error: 'user_cancelled' });
  });
});
