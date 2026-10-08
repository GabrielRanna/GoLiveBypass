import { parseWgConfig } from './parse';
import { validateWgConfig } from './validate';
import { rewriteForFullTunnel } from './rewrite';

export interface StoreIo {
  write(path: string, data: string, mode: number): void;
  mkdirp(path: string): void;
  configPath(): string;
}

export interface ReadIo {
  read(): string | null;
}

/** Recalcula o estado derivado do conf armazenado (chamado no startup). */
export function readConfigState(io: ReadIo): { hasConfig: boolean; needsIpv6Off: boolean } {
  const text = io.read();
  if (text == null || text.trim() === '') return { hasConfig: false, needsIpv6Off: false };
  const parsed = parseWgConfig(text);
  const v = validateWgConfig(parsed);
  return { hasConfig: v.ok, needsIpv6Off: !parsed.hasIpv6Address };
}

export function importConfig(rawText: string, io: StoreIo): {
  ok: boolean; errors: string[]; warnings: string[]; needsIpv6Off?: boolean;
} {
  const parsed = parseWgConfig(rawText);
  const v = validateWgConfig(parsed);
  if (!v.ok) return { ok: false, errors: v.errors, warnings: v.warnings };

  const { text, needsIpv6Off } = rewriteForFullTunnel(parsed);
  const target = io.configPath();
  io.mkdirp(target.substring(0, target.lastIndexOf('/')));
  io.write(target, text, 0o600);
  return { ok: true, errors: [], warnings: v.warnings, needsIpv6Off };
}
