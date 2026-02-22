const printable = /[A-Za-z][A-Za-z0-9\-_,.()\s]{4,}/g;

export async function parseLegacyPpt(buffer: Buffer): Promise<string> {
  const text = buffer.toString("latin1");
  const tokens = Array.from(text.matchAll(printable)).map((match) => match[0].trim());

  const cleaned = tokens
    .map((token) => token.replace(/\s+/g, " "))
    .filter((token) => token.length >= 5 && token.length <= 160);

  return cleaned.join("\n");
}
