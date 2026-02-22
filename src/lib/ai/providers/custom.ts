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
