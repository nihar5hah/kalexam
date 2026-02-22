import pdfParse from "pdf-parse";

export async function parsePdf(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text?.trim() ?? "";
}
