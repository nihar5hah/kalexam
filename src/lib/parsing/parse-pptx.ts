import JSZip from "jszip";

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function parsePptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const slidesText = await Promise.all(
    slideFiles.map(async (slideName) => {
      const xml = await zip.file(slideName)?.async("text");
      if (!xml) {
        return "";
      }

      const textParts = Array.from(xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)).map((match) =>
        decodeXmlEntities(match[1]).trim()
      );

      return textParts.filter(Boolean).join(" ");
    })
  );

  return slidesText.filter(Boolean).join("\n");
}
