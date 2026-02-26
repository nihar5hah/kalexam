const DEFAULT_GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";

type GeminiErrorCode = "missing_api_key" | "request_failed" | "empty_response";

function createGeminiError(code: GeminiErrorCode, message: string): Error & { code: GeminiErrorCode } {
  const error = new Error(message) as Error & { code: GeminiErrorCode };
  error.name = "GeminiProviderError";
  error.code = code;
  return error;
}

export async function generateWithGeminiModel(prompt: string, modelName: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw createGeminiError("missing_api_key", "Missing GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw createGeminiError("request_failed", `Gemini request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text =
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";

  if (!text.trim()) {
    throw createGeminiError("empty_response", "Gemini returned empty response");
  }

  return text;
}

function extractGeminiTextFromPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const data = payload as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

export async function generateWithGeminiModelStream(
  prompt: string,
  modelName: string,
  onDelta: (chunk: string) => void,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw createGeminiError("missing_api_key", "Missing GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw createGeminiError("request_failed", `Gemini request failed: ${response.status} ${errorText}`);
  }

  if (!response.body) {
    throw createGeminiError("request_failed", "Gemini stream body missing");
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

      const payload = line.replace(/^data:\s*/, "").trim();
      if (!payload || payload === "[DONE]") {
        continue;
      }

      try {
        const parsed = JSON.parse(payload) as unknown;
        const chunk = extractGeminiTextFromPayload(parsed);
        if (!chunk) {
          continue;
        }

        combined += chunk;
        onDelta(chunk);
      } catch {
        continue;
      }
    }
  }

  if (!combined.trim()) {
    throw createGeminiError("empty_response", "Gemini returned empty response");
  }

  return combined;
}

export async function generateWithGemini(prompt: string): Promise<string> {
  return generateWithGeminiModel(prompt, DEFAULT_GEMINI_MODEL);
}
