
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
      error: "Gemini API key is missing in Vercel."
    });
  }

  try {
    const { message, messages } = req.body || {};

    let conversation = [];

    if (Array.isArray(messages)) {
      conversation = messages
        .filter(item =>
          item &&
          ["user", "model"].includes(item.role) &&
          typeof item.text === "string" &&
          item.text.trim()
        )
        .slice(-16)
        .map(item => ({
          role: item.role,
          parts: [{ text: item.text.slice(0, 6000) }]
        }));
    }

    if (
      conversation.length === 0 &&
      typeof message === "string" &&
      message.trim()
    ) {
      conversation.push({
        role: "user",
        parts: [{ text: message.trim().slice(0, 6000) }]
      });
    }

    if (!conversation.length) {
      return res.status(400).json({
        error: "Please send a message."
      });
    }

    if (conversation[conversation.length - 1].role !== "user") {
      return res.status(400).json({
        error: "The latest message must be from the user."
      });
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 45000);

    let response;

    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `You are JARVIS, a highly intelligent personal AI assistant.

Your personality:
- Speak naturally, confidently and respectfully.
- Address the user as boss occasionally.
- Be practical, helpful and honest.
- Understand English, Hindi and Hinglish.
- Reply in the same language the user uses.
- Give clear advice and useful explanations.
- Never pretend to perform actions you cannot perform.
- Remember the conversation context provided to you.
- Avoid unnecessary robotic phrases.
- Keep simple answers concise and complicated answers detailed.

You are JARVIS. You are here to assist your boss.`
              }]
            },
            contents: conversation,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 2048
            }
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(
        response.status >= 500 ? 502 : response.status
      ).json({
        error: data?.error?.message ||
          "Gemini could not process the request."
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "JARVIS received an empty response."
      });
    }

    return res.status(200).json({
      reply
    });

  } catch (error) {
    console.error("JARVIS server error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "JARVIS took too long to respond. Please try again."
      });
    }

    return res.status(500).json({
      error: "JARVIS connection failed. Please try again."
    });
  }
}
