export function estimateTokens(input: unknown): number {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return Math.max(1, Math.ceil((text ?? '').length / 4));
}
