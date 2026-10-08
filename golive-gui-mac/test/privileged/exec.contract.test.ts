import { describe, it, expect } from 'vitest';
import * as exec from '../../src/main/privileged/exec';
import * as restart from '../../src/main/discord/restart';
import * as ipv6 from '../../src/main/net/ipv6';
import * as collect from '../../src/main/tunnel/collect';
import * as activation from '../../src/main/tunnel/activation';

describe('contratos dos adaptadores de efeito', () => {
  it('exportam as funções esperadas', () => {
    expect(typeof exec.spawnOsascript).toBe('function');
    expect(typeof restart.restartDiscord).toBe('function');
    expect(typeof ipv6.primaryService).toBe('function');
    expect(typeof collect.readDefaultRoute).toBe('function');
    expect(typeof collect.publicIp).toBe('function');
    expect(typeof activation.runActivation).toBe('function');
    expect(typeof activation.runDeactivation).toBe('function');
  });
});
