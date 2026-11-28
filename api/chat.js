

const MODELS = [
  "gemini-3.8-flash",
  "gemini-3.5-flash-lite"
];

const TIMEZONE = "Asia/Kolkata";

function getLiveContext() {
  const now = new Date();

  const date = new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIMEZONE
  }).format(now);

  const time = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: TIMEZONE
  }).format(now);

  return `
LIVE SYSTEM CONTEXT:
Current date: ${date}
Current time: ${time}
Timezone: ${TIMEZONE}

Always use this live date and time when answering questions about today.
Never claim the current year is 2024.
Do not invent current events or claim to have searched the internet.
`;
}

function getSystemPrompt() {
  return `
You are JARVIS, an intelligent personal AI assistant.

PERSONALITY:
- Speak naturally, confidently and respectfully.
- Address the user as boss occasionally, not in every reply.
- Be intelligent, practical, helpful and honest.
- Understand English, Hindi and Hinglish.
- Reply in the language the user uses.
- Give useful advice and clear explanations.
- Remember the conversation context provided.
- Never pretend to perform actions you cannot perform.
- Avoid repetitive robotic responses.
- Avoid unnecessary introductions and repeated conclusions.
- Answer simple questions directly.
- Think carefully before answering complex questions.
- Break complicated tasks into clear steps.
- If you are uncertain, say so honestly.

RESPONSE STYLE:
- Sound like a capable personal AI assistant.
- Be concise when the question is simple.
- Give detailed answers when the task needs them.
- Do not unnecessarily repeat the user's question.
- Maintain context throughout the conversation.

IDENTITY:
You are JARVIS.
Your purpose is to assist your boss.

${getLiveContext()}
`;
}

const TIMEOUT_MS = 15000;
const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 6000;

async function callGemini(model, contents, apiKey) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

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
            parts: [
              {
                text: getSystemPrompt()
              }
            ]
          },
          contents,
          generationConfig: {
            maxOutputTokens: 1536
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
    408,
    429,
    500,
    502,
    503,
    504
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
        .slice(-MAX_MESSAGES)
        .map(item => ({
          role: item.role,
          parts: [
            {
              text: item.text.slice(0, MAX_MESSAGE_LENGTH)
            }
          ]
        }));
    }

    if (
      contents.length === 0 &&
      typeof message === "string" &&
      message.trim()
    ) {
      contents.push({
        role: "user",
        parts: [
          {
            text: message.trim().slice(0, MAX_MESSAGE_LENGTH)
          }
        ]
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
          `JARVIS ${model} failed:`,
          error.message
        );

        // Try the backup model after a failure.
        // Do not waste time retrying the same model.
        if (!isTemporary(error) && error.status !== 404) {
          break;
        }
      }
    }

    console.error(
      "All JARVIS models failed:",
      lastError?.message
    );

    const timedOut = lastError?.name === "AbortError";

    return res.status(503).json({
      error: timedOut
        ? "JARVIS response timed out. Please try again."
        : "JARVIS is temporarily unavailable. Please try again shortly."
    });

  } catch (error) {
    console.error(
      "JARVIS server error:",
      error.message
    );

    return res.status(500).json({
      error: "JARVIS encountered a server error."
    });
  }
}
