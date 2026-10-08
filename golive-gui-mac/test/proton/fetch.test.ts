import { describe, it, expect } from 'vitest';
import { pickLowestPing } from '../../src/main/proton/fetch';

describe('pickLowestPing', () => {
  it('escolhe o menor ping e desempata pela carga', () => {
    const r = pickLowestPing([
      { server: 'MX-FREE#4', country: 'MX', city: 'Mexico City', load: 72, pingMs: 123 },
      { server: 'US-FREE#51', country: 'US', city: 'Miami', load: 81, pingMs: 116 },
      { server: 'US-FREE#95', country: 'US', city: 'Miami', load: 60, pingMs: 116 },
      { server: 'US-FREE#1', country: 'US', city: 'Ashburn', load: 10 },
    ]);
    expect(r).toEqual({ server: 'US-FREE#95', country: 'US', city: 'Miami', pingMs: 116 });
  });
  it('null quando nenhum servidor respondeu ao ping', () => {
    expect(pickLowestPing([{ server: 'US-FREE#1', country: 'US', city: 'Ashburn', load: 10 }])).toBeNull();
  });
});
