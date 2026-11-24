
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ reply: "Gemini API key is missing." });
    }

    const message =
      req.body?.message ||
      req.body?.prompt ||
      req.body?.text;

    if (!message) {
      return res.status(400).json({ reply: "Boss, I didn't receive your message." });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: "You are JARVIS, a male personal AI assistant. Address the user respectfully as boss. Speak confidently, calmly, intelligently and naturally. Be practical, honest and slightly witty. Give useful advice. Keep replies conversational and concise."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: String(message) }]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);
      return res.status(502).json({
        reply: "Boss, my AI connection is having trouble. Please try again."
      });
    }

    const reply =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") || "Boss, I couldn't generate a response.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      reply: "Boss, something went wrong. Please try again."
    });
  }
}
