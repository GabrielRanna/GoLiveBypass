import { describe, it, expect } from 'vitest';
import { buildPhoneConf, PHONE_DEVICE_NAME } from '../../src/main/phone/phone-conf';

const RAW = `[Interface]
PrivateKey = cHJpdmF0ZWtleXByaXZhdGVrZXlwcml2YXRla2V5MTI=
Address = 10.2.0.2/32
DNS = 10.2.0.1
PostUp = echo x

[Peer]
PublicKey = cHVibGlja2V5cHVibGlja2V5cHVibGlja2V5cHViMTI=
AllowedIPs = 0.0.0.0/0
Endpoint = 1.2.3.4:51820
`;

const conf = (raw: string, p: 'ios' | 'android') => {
  const r = buildPhoneConf(raw, p);
  if (!r.ok) throw new Error(r.error);
  return r.conf;
};

describe('buildPhoneConf', () => {
  it('iPhone: só os ranges do Discord, IPv6 da Cloudflare em buraco negro e sem DNS', () => {
    const c = conf(RAW, 'ios');
    expect(c).toContain('AllowedIPs = 162.159.0.0/16, 104.16.0.0/12, 2606:4700::/32, 2a06:98c0::/29');
    expect(c).toContain('PersistentKeepalive = 25');
    expect(c).toContain('Endpoint = 1.2.3.4:51820');
    expect(c).not.toMatch(/DNS|PostUp|IncludedApplications|0\.0\.0\.0\/0/);
  });

  it('Android: túnel só do app do Discord, com o DNS do Proton', () => {
    const c = conf(RAW, 'android');
    expect(c).toContain('DNS = 10.2.0.1');
    expect(c).toContain('IncludedApplications = com.discord');
    expect(c).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
    expect(c).not.toContain('PostUp');
  });

  it('não duplica um keepalive existente', () => {
    const c = conf(RAW.replace('Endpoint', 'PersistentKeepalive = 15\nEndpoint'), 'ios');
    expect(c.match(/PersistentKeepalive/g)).toHaveLength(1);
    expect(c).toContain('PersistentKeepalive = 15');
  });

  it('conf sem chave privada ou sem endpoint não é entregue', () => {
    expect(buildPhoneConf(RAW.replace(/PrivateKey.*\n/, ''), 'ios')).toEqual({ ok: false, error: 'invalid_conf' });
    expect(buildPhoneConf(RAW.replace(/Endpoint.*\n/, ''), 'android')).toEqual({ ok: false, error: 'invalid_conf' });
  });

  it('nomes de dispositivo no painel do Proton', () => {
    expect(PHONE_DEVICE_NAME).toEqual({ ios: 'GoLiveBypass-iPhone', android: 'GoLiveBypass-Android' });
  });
});
