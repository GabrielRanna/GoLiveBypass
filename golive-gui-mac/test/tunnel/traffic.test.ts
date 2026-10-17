import { describe, it, expect } from 'vitest';
import { discordUtun, parseIfaceBytes, rateMbps, parsePingMs } from '../../src/main/tunnel/traffic';

// Saídas reais de um Mac com o túnel ativo
const routes = `Destination        Gateway            Flags               Netif Expire
default            192.168.0.1        UGScg                 en0
104.16/12          utun5              USc                 utun5
162.159            utun5              USc                 utun5
`;
const ifaceOut = `Name       Mtu   Network       Address            Ipkts Ierrs     Ibytes    Opkts Oerrs     Obytes  Coll
utun5      1420  <Link#19>                        11190     0   13870256     2856     0     442176     0
utun5      1420  10.2.0.2/32   10.2.0.2           11190     -   13870256     2856     -     442176     -
`;

describe('tráfego do túnel', () => {
  it('acha a utun dos ranges do Discord', () => {
    expect(discordUtun(routes)).toBe('utun5');
    expect(discordUtun('default 192.168.0.1 UGScg en0')).toBeNull();
  });

  it('lê os bytes da linha Link sem root', () => {
    expect(parseIfaceBytes(ifaceOut, 'utun5')).toEqual({ rx: 13870256, tx: 442176 });
    expect(parseIfaceBytes(ifaceOut, 'utun9')).toBeNull();
  });

  it('linha Link com endereço não perde a coluna', () => {
    const withAddr = `Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll
utun1 1380 <Link#15> aa:bb 0 0 100 147 0 26250 0
`;
    expect(parseIfaceBytes(withAddr, 'utun1')).toEqual({ rx: 100, tx: 26250 });
  });

  it('calcula Mbps e ignora contador que voltou', () => {
    expect(rateMbps({ rx: 0, tx: 0 }, { rx: 1_250_000, tx: 125_000 }, 1000)).toEqual({ down: 10, up: 1 });
    expect(rateMbps({ rx: 500, tx: 0 }, { rx: 100, tx: 0 }, 1000)).toBeNull();
  });

  it('lê o ping', () => {
    expect(parsePingMs('64 bytes from 162.159.135.234: icmp_seq=0 ttl=58 time=119.203 ms')).toBe(119);
    expect(parsePingMs('Request timeout for icmp_seq 0')).toBeNull();
  });
});
