import { spawn } from 'child_process';
import type { ExecResult } from './run';

export function spawnOsascript(cmd: string, args: string[]): Promise<ExecResult> {
  return new Promise(resolve => {
    const p = spawn(cmd, args);
    let stdout = '', stderr = '';
    p.stdout.on('data', d => (stdout += d.toString()));
    p.stderr.on('data', d => (stderr += d.toString()));
    p.on('close', code => resolve({ code, stdout, stderr }));
    p.on('error', err => resolve({ code: 127, stdout, stderr: String(err) }));
  });
}
