import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { EventEmitter } from 'events';

export interface ProtonFetchOpts {
  username: string;
  password: string;
  binDir: string;
  sessDir: string;
  confOut: string;
}

export interface ProtonFetchResult {
  ok: boolean;
  error?: 'captcha' | 'auth_failed' | 'no_servers' | 'binary_missing' | 'unknown';
  captchaUrl?: string;
  confPath?: string;
}

/** Emite 'progress' (string) e 'done' (ProtonFetchResult) */
export class ProtonFetcher extends EventEmitter {
  private proc: child_process.ChildProcess | null = null;

  fetch(opts: ProtonFetchOpts): void {
    const bin = path.join(opts.binDir, '..', 'extra', 'proton-confgen', 'proton-confgen');
    if (!fs.existsSync(bin)) {
      this.emit('done', { ok: false, error: 'binary_missing' } satisfies ProtonFetchResult);
      return;
    }

    fs.mkdirSync(opts.sessDir, { recursive: true });

    const args = [
      '-username', opts.username,
      '-password', opts.password,
      '-free-only',
      '-exclude-countries', 'BR',
      '-auto-ping',
      '-output', opts.confOut,
      '-session-file', path.join(opts.sessDir, 'session.json'),
      '-json',
    ];

    this.emit('progress', '[1/3] Autenticando no ProtonVPN…');

    const proc = child_process.spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.proc = proc;

    let outBuf = '';
    let errBuf = '';

    proc.stdout?.on('data', (d: Buffer) => {
      outBuf += d.toString();
      // Parse JSON progress lines
      for (const line of outBuf.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message) this.emit('progress', obj.message);
          if (obj.stage === 'ping') this.emit('progress', '[2/3] Medindo ping de todos os servidores free…');
          if (obj.stage === 'write') this.emit('progress', '[3/3] Gerando configuração WireGuard…');
        } catch { /* linha não-JSON */ }
      }
    });

    proc.stderr?.on('data', (d: Buffer) => { errBuf += d.toString(); });

    proc.on('close', (code) => {
      this.proc = null;
      if (code === 0 && fs.existsSync(opts.confOut)) {
        this.emit('progress', 'Configuração obtida com sucesso!');
        this.emit('done', { ok: true, confPath: opts.confOut } satisfies ProtonFetchResult);
        return;
      }

      const combined = outBuf + errBuf;

      // Detecção de CAPTCHA / verificação humana
      if (/captcha|human.?verif|hv.?token|recaptcha/i.test(combined)) {
        const urlMatch = combined.match(/https?:\/\/\S+captcha\S*/i);
        this.emit('done', {
          ok: false,
          error: 'captcha',
          captchaUrl: urlMatch?.[0],
        } satisfies ProtonFetchResult);
        return;
      }

      if (/incorrect.*password|invalid.*credential|auth.*fail|wrong.*password/i.test(combined)) {
        this.emit('done', { ok: false, error: 'auth_failed' } satisfies ProtonFetchResult);
        return;
      }

      if (/no.*server|zero.*server|sem.*servidor/i.test(combined)) {
        this.emit('done', { ok: false, error: 'no_servers' } satisfies ProtonFetchResult);
        return;
      }

      this.emit('done', { ok: false, error: 'unknown' } satisfies ProtonFetchResult);
    });
  }

  cancel(): void {
    this.proc?.kill();
    this.proc = null;
  }
}
