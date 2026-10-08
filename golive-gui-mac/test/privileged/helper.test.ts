import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { helperScript } from '../../src/main/privileged/helper';

describe('helperScript', () => {
  const s = helperScript();

  it('é bash válido', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'glb-')), 'helper');
    fs.writeFileSync(f, s);
    expect(() => execFileSync('bash', ['-n', f])).not.toThrow();
  });

  it('não mexe no IPv6 do sistema inteiro', () => {
    expect(s).not.toContain('setv6off');
    expect(s).not.toContain('-alias');
  });

  it('sanitize força AllowedIPs do Discord e descarta PostUp/DNS', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'glb-'));
    const src = path.join(dir, 'in.conf');
    fs.writeFileSync(src, [
      '[Interface]', 'PrivateKey = k', 'Address = 10.2.0.2/32', 'DNS = 10.2.0.1', 'PostUp = touch /tmp/pwn',
      '[Peer]', 'PublicKey = p', 'AllowedIPs = 0.0.0.0/0, ::/0', 'Endpoint = 1.2.3.4:51820',
    ].join('\n'));
    const awk = s.match(/awk -v allowed='([^']+)' '([\s\S]+?)' "\$src"/);
    expect(awk).not.toBeNull();
    const out = execFileSync('awk', ['-v', `allowed=${awk![1]}`, awk![2], src], { encoding: 'utf8' });
    expect(out).toContain('AllowedIPs = 162.159.0.0/16, 104.16.0.0/12');
    expect(out).not.toMatch(/0\.0\.0\.0\/0|::\/0|PostUp|DNS/);
    expect(out).toContain('Endpoint = 1.2.3.4:51820');
  });
});
