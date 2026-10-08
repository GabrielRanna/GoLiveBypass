import { describe, it, expect } from 'vitest';
import { classifyOsascriptError, runPrivileged } from '../../src/main/privileged/run';

describe('classifyOsascriptError', () => {
  it('detecta cancelamento do usuário', () => {
    expect(classifyOsascriptError(-128, 'User canceled.')).toBe('user_cancelled');
  });
  it('detecta binário ausente', () => {
    expect(classifyOsascriptError(127, 'wg-quick: command not found')).toBe('binary_missing');
  });
  it('fallback é wg_failed', () => {
    expect(classifyOsascriptError(1, 'RTNETLINK answers: ...')).toBe('wg_failed');
  });
});

describe('runPrivileged', () => {
  it('ok quando exec resolve com code 0', async () => {
    const exec = async () => ({ code: 0, stdout: 'done', stderr: '' });
    const r = await runPrivileged(['-e', 'x'], exec);
    expect(r.ok).toBe(true);
    expect(r.stdout).toBe('done');
  });
  it('classifica erro quando exec falha', async () => {
    const exec = async () => ({ code: -128, stdout: '', stderr: 'User canceled.' });
    const r = await runPrivileged(['-e', 'x'], exec);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('user_cancelled');
  });
});
