

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return res.status(500).json({
      error: "Gemini API key is missing. Check Vercel Environment Variables."
    });
  }

  try {
    const { message, messages } = req.body || {};

    const conversation = Array.isArray(messages)
      ? messages
          .filter(m =>
            m &&
            ["user", "model"].includes(m.role) &&
            typeof m.text === "string"
          )
          .slice(-16)
          .map(m => ({
            role: m.role,
            parts: [{ text: m.text.slice(0, 6000) }]
          }))
      : [];

    if (!conversation.length && typeof message === "string" && message.trim()) {
      conversation.push({
        role: "user",
        parts: [{ text: message.trim().slice(0, 6000) }]
      });
    }

    if (!conversation.length) {
      return res.status(400).json({ error: "Please send a message." });
    }

    if (conversation[conversation.length - 1].role !== "user") {
      return res.status(400).json({ error: "The latest message must be from you." });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    let response;

    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text: `You are JARVIS, a highly capable personal AI assistant.
Speak naturally, intelligently, confidently and respectfully.
Address the user as "boss" occasionally, not in every sentence.
Be helpful, honest, practical and conversational.
Respond in the same language the user uses. Understand Hindi, English and Hinglish.
Do not claim to have performed actions you cannot perform.
Keep ordinary answers clear and concise. Explain complicated topics properly.
You are an assistant, not a human.`
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
      return res.status(response.status >= 500 ? 502 : response.status).json({
        error: data?.error?.message || "Gemini could not process the request."
      });
    }

    const reply = data?.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        error: "JARVIS received an empty response. Please try again."
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("JARVIS server error:", error);

    if (error.name === "AbortError") {
      return res.status(504).json({
        error: "JARVIS took too long to respond. Please try again."
      });
    }

    return res.status(500).json({
      error: "JARVIS could not connect. Please try again."
    });
  }
}
