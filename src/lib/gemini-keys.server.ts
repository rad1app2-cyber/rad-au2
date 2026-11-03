/**
 * Returns all configured free Gemini keys, starting with "today's" key so usage
 * rotates daily. Callers fall through to the next key on quota/key errors.
 */
export function geminiKeys(): string[] {
  const keys = [
    process.env["GEMINI_API_KEY_1"],
    process.env["GEMINI_API_KEY_2"],
    process.env["GEMINI_API_KEY_3"],
    process.env["GEMINI_API_KEY"],
  ]
    .map((k) => k?.trim())
    .filter((k): k is string => Boolean(k));
  const unique = [...new Set(keys)];
  if (!unique.length) return [];
  const day = Math.floor(Date.now() / 86_400_000) % unique.length;
  return [...unique.slice(day), ...unique.slice(0, day)];
}
