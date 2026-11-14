import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const CARTESIA_API_KEY = process.env.CARTESIA_API_KEY;
const CARTESIA_VERSION = "2026-08-14";

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "12kb" }));
app.use("/api", rateLimit({ windowMs: 60_000, limit: 35, standardHeaders: "draft-8", legacyHeaders: false }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({ ok: true, speechConfigured: Boolean(CARTESIA_API_KEY), provider: "Cartesia", model: "sonic-3.6" });
});

app.get("/api/voices", async (_req, res) => {
  if (!CARTESIA_API_KEY) return res.status(503).json({ error: "Cartesia is not configured. Add CARTESIA_API_KEY to your hosting environment." });
  try {
    const upstream = await fetch("https://api.cartesia.ai/voices", {
      headers: { "X-API-Key": CARTESIA_API_KEY, "Cartesia-Version": CARTESIA_VERSION }
    });
    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data.message || data.error || "Cartesia could not load your voice." });
    const source = Array.isArray(data) ? data : (data.data || data.voices || data.items || []);
    const first = source.find(v => v && v.id);
    if (!first) return res.status(502).json({ error: "Cartesia returned no available voices for this API key." });
    res.json({ voice: { id: first.id, name: first.name || first.description || "Rohan's Cartesia voice" } });
  } catch (error) {
    console.error("Cartesia voices error:", error.message);
    res.status(502).json({ error: "Could not connect to Cartesia voice service." });
  }
});

app.post("/api/tts", async (req, res) => {
  if (!CARTESIA_API_KEY) return res.status(503).json({ error: "Speech is not configured. Add CARTESIA_API_KEY to your hosting environment." });
  const transcript = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  const voiceId = typeof req.body?.voiceId === "string" ? req.body.voiceId : "";
  const speed = Number(req.body?.speed ?? 1);
  if (!transcript || transcript.length > 900) return res.status(400).json({ error: "Text must be between 1 and 900 characters." });
  if (!voiceId || voiceId.length > 100) return res.status(400).json({ error: "Choose a valid Cartesia voice first." });
  if (!Number.isFinite(speed) || speed < 0.6 || speed > 1.5) return res.status(400).json({ error: "Speech speed must be between 0.6 and 1.5." });
  try {
    const upstream = await fetch("https://api.cartesia.ai/tts/bytes", {
      method: "POST",
      headers: {
        "X-API-Key": CARTESIA_API_KEY,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: "sonic-3.6",
        transcript,
        voice: { mode: "id", id: voiceId },
        language: "en",
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
        generation_config: { speed }
      })
    });
    if (!upstream.ok) {
      const message = await upstream.text();
      console.error("Cartesia TTS error:", upstream.status, message.slice(0, 500));
      return res.status(upstream.status).json({ error: "Cartesia could not generate speech. Check your API key and voice selection." });
    }
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    const audio = Buffer.from(await upstream.arrayBuffer());
    res.send(audio);
  } catch (error) {
    console.error("TTS request failed:", error.message);
    res.status(502).json({ error: "Could not connect to Cartesia." });
  }
});

app.use((_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Rohan AI listening on port ${PORT}`));