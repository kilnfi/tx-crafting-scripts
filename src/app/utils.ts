export function prefix0x(hex: string): `0x${string}` {
  return hex.startsWith('0x') ? (hex as `0x${string}`) : (`0x${hex}` as `0x${string}`);
}

export function remove0x(hex: string): string {
  return hex.startsWith('0x') ? hex.substring(2) : hex;
}
