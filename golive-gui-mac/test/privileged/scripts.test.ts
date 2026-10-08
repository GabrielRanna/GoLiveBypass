import { describe, it, expect } from 'vitest';
import { buildActivateScript, buildDeactivateScript } from '../../src/main/privileged/command';

const base = { binDir: '/App/res/bin', confPath: '/p/golive.conf', iface: 'golive', service: 'Wi-Fi', handshakeTimeoutSec: 15 };

describe('buildActivateScript', () => {
  it('faz tudo num único script: v6-off + up + espera de handshake + down defensivo', () => {
    const s = buildActivateScript({ ...base, setV6Off: true });
    // uma única elevação cobre setv6off E wg-quick up
    expect(s).toContain("networksetup -setv6off 'Wi-Fi'");
    expect(s).toContain("wg-quick up '/p/golive.conf'");
    // readiness real por latest-handshakes
    expect(s).toContain('latest-handshakes');
    // teardown defensivo no timeout
    expect(s).toContain("wg-quick down '/p/golive.conf'");
    expect(s).toContain("networksetup -setv6automatic 'Wi-Fi'");
    expect(s).toContain('handshake_timeout');
  });

  it('escapa nome de serviço hostil (sem injeção de shell)', () => {
    const s = buildActivateScript({ ...base, service: "x'; rm -rf /; '", setV6Off: true });
    expect(s).toContain("networksetup -setv6off 'x'\\''; rm -rf /; '\\'''");
    expect(s).not.toMatch(/setv6off x; rm/);
  });

  it('omite linhas de IPv6 quando setV6Off=false', () => {
    const s = buildActivateScript({ ...base, setV6Off: false });
    expect(s).not.toContain('networksetup');
    expect(s).toContain("wg-quick up '/p/golive.conf'");
  });
});

describe('buildDeactivateScript', () => {
  it('derruba e restaura IPv6 num único script', () => {
    const s = buildDeactivateScript({ ...base, restoreV6: true });
    expect(s).toContain("wg-quick down '/p/golive.conf'");
    expect(s).toContain("networksetup -setv6automatic 'Wi-Fi'");
  });
  it('não toca IPv6 quando restoreV6=false', () => {
    const s = buildDeactivateScript({ ...base, restoreV6: false });
    expect(s).not.toContain('networksetup');
  });
});
