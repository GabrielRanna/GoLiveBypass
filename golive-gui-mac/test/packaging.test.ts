import { describe, it, expect } from 'vitest';
import * as fs from 'fs';

describe('electron-builder.yml', () => {
  it('declara dmg arm64 e empacota resources/bin', () => {
    const y = fs.readFileSync('electron-builder.yml', 'utf8');
    expect(y).toMatch(/target:\s*\n?\s*-?\s*dmg/);
    expect(y).toContain('universal');
    expect(y).toContain('resources/bin');
    expect(y).toMatch(/notarize:\s*false/);
  });
});
