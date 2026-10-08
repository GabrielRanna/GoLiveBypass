import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { enableFakeNitro, vencordSettingsPath, isVencordInjected } from '../src/main/vencord/inject';

describe('enableFakeNitro', () => {
  it('liga o plugin preservando outras configurações', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-v-'));
    const p = vencordSettingsPath(home);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ themeLinks: ['x'], plugins: { FakeNitro: { enabled: false, transformEmojis: true }, Other: { enabled: true } } }));
    enableFakeNitro(home);
    const s = JSON.parse(fs.readFileSync(p, 'utf8'));
    expect(s.plugins.FakeNitro).toEqual({ enabled: true, transformEmojis: true });
    expect(s.plugins.Other).toEqual({ enabled: true });
    expect(s.themeLinks).toEqual(['x']);
  });
  it('cria o arquivo se não existir', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-v-'));
    enableFakeNitro(home);
    expect(JSON.parse(fs.readFileSync(vencordSettingsPath(home), 'utf8')).plugins.FakeNitro.enabled).toBe(true);
  });
});

describe('isVencordInjected', () => {
  it('detecta pelo _app.asar', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-d-'));
    fs.mkdirSync(path.join(app, 'Contents', 'Resources'), { recursive: true });
    expect(isVencordInjected(app)).toBe(false);
    fs.writeFileSync(path.join(app, 'Contents', 'Resources', '_app.asar'), '');
    expect(isVencordInjected(app)).toBe(true);
  });
});

import { canModifyApp } from '../src/main/vencord/inject';

describe('canModifyApp', () => {
  it('true quando dá para escrever no bundle; false quando negado', () => {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-p-'));
    const res = path.join(app, 'Contents', 'Resources');
    fs.mkdirSync(res, { recursive: true });
    expect(canModifyApp(app)).toBe(true);
    expect(fs.readdirSync(res)).toEqual([]);
    fs.chmodSync(res, 0o555);
    try { expect(canModifyApp(app)).toBe(false); } finally { fs.chmodSync(res, 0o755); }
  });
});
