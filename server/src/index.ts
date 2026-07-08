import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "./systemPrompt.js";

const PORT = Number(process.env.PORT) || 3000;
const MODEL = "claude-sonnet-4-6";
const MAX_HISTORY_MESSAGES = 30;

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY. Add it to server/.env before starting the server.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const app = express();
app.use(cors());
app.use(express.json());

app.post("/chat", async (req, res) => {
  const messages: ChatMessage[] = req.body?.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Request body must include a non-empty `messages` array." });
    return;
  }

  const trimmed = messages.slice(-MAX_HISTORY_MESSAGES);

  try {
    const system = buildSystemPrompt();
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: trimmed,
    });

    const reply = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    res.json({ reply });
  } catch (err) {
    console.error("Anthropic API error:", err);
    res.status(502).json({ error: "Failed to reach the coach. Try again." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Vigil proxy listening on http://0.0.0.0:${PORT}`);
});
