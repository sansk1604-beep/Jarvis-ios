
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed." });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const message =
      req.body?.message ||
      req.body?.prompt ||
      req.body?.text;

    if (!apiKey) {
      return res.status(500).json({ reply: "Gemini API key is missing." });
    }

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
          systemInstruction: {
            parts: [{
              text: "You are JARVIS, a male personal AI assistant. Address the user as boss. Be confident, calm, intelligent, respectful, practical and slightly witty. Give honest advice and concise conversational replies."
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
      console.error("Gemini error:", data);
      return res.status(502).json({
        reply: "Boss, my AI connection encountered an error."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("") || "Boss, I couldn't generate a reply.";

    return res.status(200).json({ reply });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      reply: "Boss, something went wrong."
    });
  }
}
