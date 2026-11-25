
const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
];

const SYSTEM_PROMPT = `
You are JARVIS, an intelligent personal AI assistant.

PERSONALITY:
- Speak naturally, confidently and respectfully.
- Address the user as boss occasionally.
- Be intelligent, practical, helpful and honest.
- Understand English, Hindi and Hinglish.
- Always reply in the language the user uses.
- Give useful advice and clear explanations.
- Remember the conversation context provided.
- Never pretend to perform actions you cannot perform.
- Avoid repetitive robotic responses.

You are JARVIS. Your purpose is to assist your boss.
`;

const sleep = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

async function callGemini(model, contents, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents,
          generationConfig: {
            maxOutputTokens: 2048
          }
        }),
        signal: controller.signal
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(
        data?.error?.message || "Gemini request failed."
      );
      error.status = response.status;
      throw error;
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      throw new Error("Gemini returned an empty response.");
    }

    return reply;

  } finally {
    clearTimeout(timer);
  }
}

function isTemporary(error) {
  return [
    408, 429, 500, 502, 503, 504
  ].includes(error.status) ||
    error.name === "AbortError";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "GEMINI_API_KEY is missing in Vercel."
    });
  }

  try {
    const { message, messages } = req.body || {};

    let contents = [];

    if (Array.isArray(messages)) {
      contents = messages
        .filter(item =>
          item &&
          ["user", "model"].includes(item.role) &&
          typeof item.text === "string" &&
          item.text.trim()
        )
        .slice(-16)
        .map(item => ({
          role: item.role,
          parts: [{
            text: item.text.slice(0, 6000)
          }]
        }));
    }

    if (
      contents.length === 0 &&
      typeof message === "string" &&
      message.trim()
    ) {
      contents.push({
        role: "user",
        parts: [{
          text: message.trim().slice(0, 6000)
        }]
      });
    }

    if (!contents.length) {
      return res.status(400).json({
        error: "Please send a message."
      });
    }

    if (contents[contents.length - 1].role !== "user") {
      return res.status(400).json({
        error: "The latest message must be from the user."
      });
    }

    let lastError;

    for (const model of MODELS) {
      // Two attempts for the primary model, one for the backup.
      const attempts = model === MODELS[0] ? 2 : 1;

      for (let attempt = 0; attempt < attempts; attempt++) {
        try {
          const reply = await callGemini(
            model,
            contents,
            apiKey
          );

          return res.status(200).json({
            reply,
            model
          });

        } catch (error) {
          lastError = error;

          console.error(
            `JARVIS ${model} attempt ${attempt + 1}:`,
            error.message
          );

          if (!isTemporary(error)) {
            break;
          }

          if (attempt < attempts - 1) {
            await sleep(900);
          }
        }
      }
    }

    console.error("All JARVIS models failed:", lastError);

    const status = lastError?.status || 503;

    return res.status(
      status >= 400 && status < 500 && status !== 408 && status !== 429
        ? status
        : 503
    ).json({
      error: lastError?.name === "AbortError"
        ? "AI response timed out. Please try again."
        : "Both AI models are temporarily unavailable. Please try again shortly."
    });

  } catch (error) {
    console.error("JARVIS server error:", error);

    return res.status(500).json({
      error: "JARVIS encountered a server error."
    });
  }
}
