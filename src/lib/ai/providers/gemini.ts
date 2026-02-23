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

export async function generateWithGemini(prompt: string): Promise<string> {
  return generateWithGeminiModel(prompt, DEFAULT_GEMINI_MODEL);
}
