import { CustomProviderConfig } from "@/lib/ai/types";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

export async function generateWithCustomProvider(
  prompt: string,
  config: CustomProviderConfig
): Promise<string> {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a study strategy assistant. Return concise, practical exam preparation plans.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom provider request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;

  if (!content?.trim()) {
    throw new Error("Custom provider returned empty response");
  }

  return content;
}

function tryParseSseJson(line: string): Record<string, unknown> | null {
  const payload = line.replace(/^data:\s*/, "").trim();
  if (!payload || payload === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function generateWithCustomProviderStream(
  prompt: string,
  config: CustomProviderConfig,
  onDelta: (chunk: string) => void,
): Promise<string> {
  const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      temperature: 0.2,
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "You are a study strategy assistant. Return concise, practical exam preparation plans.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom provider request failed: ${response.status} ${errorText}`);
  }

  if (!response.body) {
    throw new Error("Custom provider streaming body missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let combined = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) {
        continue;
      }

      const json = tryParseSseJson(line);
      if (!json) {
        continue;
      }

      const choices = json.choices as Array<{ delta?: { content?: string }; message?: { content?: string } }> | undefined;
      const chunk = choices?.[0]?.delta?.content ?? choices?.[0]?.message?.content ?? "";
      if (!chunk) {
        continue;
      }

      combined += chunk;
      onDelta(chunk);
    }
  }

  if (!combined.trim()) {
    throw new Error("Custom provider returned empty response");
  }

  return combined;
}
