export function isBrazilIp(info: { country?: string }): boolean {
  return info.country === 'BR';
}

export async function fetchPublicIp(
  getter: () => Promise<{ ip: string; country?: string }>,
): Promise<{ ip: string; isBr: boolean } | null> {
  try {
    const info = await getter();
    return { ip: info.ip, isBr: isBrazilIp(info) };
  } catch {
    return null;
  }
}
