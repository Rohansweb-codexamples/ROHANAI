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
app.get("/music.mp3", (_req, res) => res.sendFile(path.join(__dirname, "untitled-video-8_otfFPTjE.mp3")));

app.get("/api/status", (_req, res) => {
  const configured = Boolean(CARTESIA_API_KEY);
  const looksLikeCurrentKey = configured && CARTESIA_API_KEY.startsWith("sk_car_");
  res.json({
    ok: true,
    speechConfigured: configured,
    keyFormatValid: looksLikeCurrentKey,
    provider: "Cartesia",
    model: "sonic-3.6"
  });
});

app.get("/api/voices", async (_req, res) => {
  if (!CARTESIA_API_KEY) return res.status(503).json({ error: "Cartesia is not configured. Add CARTESIA_API_KEY to your hosting environment." });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const params = new URLSearchParams({ limit: "1" });
    const upstream = await fetch(`https://api.cartesia.ai/voices?${params.toString()}`, {
      headers: { "Authorization": `Bearer ${CARTESIA_API_KEY}`, "Cartesia-Version": CARTESIA_VERSION },
      signal: controller.signal
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("Cartesia voices error:", upstream.status, JSON.stringify(data).slice(0, 500));
      if (upstream.status === 401) return res.status(401).json({ error: "Cartesia rejected the API key (401). Check CARTESIA_API_KEY in Render." });
      const detail = typeof data.message === "string" ? data.message : typeof data.error === "string" ? data.error : "";
      return res.status(upstream.status).json({ error: detail || `Cartesia voice request failed (HTTP ${upstream.status}).` });
    }
    const item = Array.isArray(data) ? data[0] : Array.isArray(data.data) ? data.data[0] : Array.isArray(data.voices) ? data.voices[0] : data.voice;
    if (!item || typeof item.id !== "string" || !item.id.trim()) {
      return res.status(502).json({ error: "Cartesia connected but did not return a voice. Check that your account has at least one available voice." });
    }
    const voice = { id: item.id, name: item.name || item.description || item.tagline || "Cartesia voice" };
    return res.json({ voices: [voice], voice, count: 1 });
  } catch (error) {
    console.error("Cartesia voices error:", error.name, error.message);
    const message = error.name === "AbortError" ? "Cartesia took too long to respond. Press Refresh to try again." : "Could not connect to Cartesia voice service.";
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
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
        "Authorization": `Bearer ${CARTESIA_API_KEY}`,
        "Cartesia-Version": CARTESIA_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model_id: "sonic-3.6",
        transcript,
        voice: { mode: "id", id: voiceId },
        language: "en",
        output_format: { container: "wav", encoding: "pcm_s16le", sample_rate: 44100 },
        generation_config: { speed, emotion: "content", volume: 1.08 }
      })
    });
    if (!upstream.ok) {
      const message = await upstream.text();
      console.error("Cartesia TTS error:", upstream.status, message.slice(0, 500));
      if (upstream.status === 401) {
        return res.status(401).json({ error: "Cartesia rejected the API key (401). Replace CARTESIA_API_KEY in Render with a current key beginning sk_car_, then redeploy." });
      }
      return res.status(upstream.status).json({ error: `Cartesia speech request failed (HTTP ${upstream.status}). Check the Render logs for details.` });
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