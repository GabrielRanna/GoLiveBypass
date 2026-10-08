import { describe, it, expect } from 'vitest';
import { shQuote, buildWgQuickShell, buildOsascriptArgs } from '../../src/main/privileged/command';

describe('shQuote', () => {
  it('neutraliza aspas simples e metacaracteres', () => {
    expect(shQuote("a'b; rm -rf /")).toBe("'a'\\''b; rm -rf /'");
  });
});

describe('buildWgQuickShell', () => {
  it('inclui env e caminho citado do conf', () => {
    const cmd = buildWgQuickShell('up', { binDir: '/App/res/bin', confPath: "/p/with space/golive.conf" });
    expect(cmd).toContain('WG_QUICK_USERSPACE_IMPLEMENTATION=wireguard-go');
    expect(cmd).toContain('PATH=/App/res/bin:/usr/bin:/bin:/usr/sbin:/sbin');
    expect(cmd).toContain("wg-quick up '/p/with space/golive.conf'");
  });
});

describe('buildOsascriptArgs', () => {
  it('monta argv com administrator privileges', () => {
    const args = buildOsascriptArgs('echo hi');
    expect(args[0]).toBe('-e');
    expect(args[1]).toContain('do shell script');
    expect(args[1]).toContain('with administrator privileges');
  });
});
