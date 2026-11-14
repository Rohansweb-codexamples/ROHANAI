import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { randomBytes, randomInt } from "node:crypto";
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
app.use("/api", rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: "draft-8", legacyHeaders: false }));

const deviceSessions = new Map();
const DEVICE_TTL = 365 * 24 * 60 * 60 * 1000;
const DATA_DIR = process.env.ROHAN_DATA_DIR || path.join(__dirname, "data");
const DEVICE_STORE = path.join(DATA_DIR, "device-sessions.json");
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const saved = JSON.parse(fs.readFileSync(DEVICE_STORE, "utf8"));
  for (const item of saved) if (item && item.code && item.speakerToken) deviceSessions.set(item.code, item);
} catch {}
function saveDeviceSessions() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const temp = DEVICE_STORE + ".tmp";
    fs.writeFileSync(temp, JSON.stringify([...deviceSessions.values()]), { mode: 0o600 });
    fs.renameSync(temp, DEVICE_STORE);
  } catch (error) { console.error("Could not persist device sessions:", error.message); }
}
function cleanDeviceSessions() {
  const now = Date.now();
  for (const [code, session] of deviceSessions) {
    if (now - session.createdAt > DEVICE_TTL) deviceSessions.delete(code);
  }
  saveDeviceSessions();
}
function findDeviceByToken(token, role) {
  if (typeof token !== "string") return null;
  for (const session of deviceSessions.values()) {
    if (role === "controller" && session.controllerToken === token) return session;
    if (role === "speaker" && session.speakerToken === token) return session;
  }
  return null;
}
app.post("/api/device/speaker-create", (_req, res) => {
 cleanDeviceSessions(); let code;
 do { code=String(randomInt(100000,1000000)); } while(deviceSessions.has(code));
 const used=[...deviceSessions.values()].map(x=>Number(String(x.name||"").split("-").pop())).filter(Number.isFinite);let number=1;while(used.includes(number))number++;const session={code,id:randomBytes(10).toString("hex"),name:"Spark Plus-"+number,controllerToken:"",speakerToken:randomBytes(24).toString("hex"),createdAt:Date.now(),lastSeen:Date.now(),speakerConnected:true,commands:[],state:{playing:false,track:"House",currentTime:0,duration:0,volume:0.85}};
 deviceSessions.set(code,session);saveDeviceSessions();res.json({ok:true,code,token:session.speakerToken});
});
app.get("/api/device/discover",(_req,res)=>{cleanDeviceSessions();const now=Date.now();const devices=[...deviceSessions.values()].filter(s=>s.speakerToken&&s.speakerConnected&&now-s.lastSeen<15000).map(s=>({id:s.id||s.code,name:s.name||"Spark Plus",connected:Boolean(s.controllerToken),lastSeen:s.lastSeen}));res.setHeader("Cache-Control","no-store");res.json({ok:true,devices});});
app.post("/api/device/controller-join",(req,res)=>{
 cleanDeviceSessions();const deviceId=String(req.body?.deviceId||"");const code=String(req.body?.code||"").replace(/\D/g,"").slice(0,6);const session=[...deviceSessions.values()].find(s=>(deviceId&&(s.id||s.code)===deviceId)||(!deviceId&&s.code===code));
 if(!session||!session.speakerToken||Date.now()-session.lastSeen>15000)return res.status(404).json({error:"That speaker is no longer online. Refresh the device list."});
 if(session.controllerToken)return res.status(409).json({error:"This speaker is already connected to a controller."});
 session.controllerToken=randomBytes(24).toString("hex");saveDeviceSessions();res.json({ok:true,token:session.controllerToken,code:session.code,name:session.name||"Spark Plus"});
});
app.post("/api/device/create", (_req, res) => {
  cleanDeviceSessions();
  let code;
  do { code = String(randomInt(100000, 1000000)); } while (deviceSessions.has(code));
  const session = {
    code, controllerToken: randomBytes(24).toString("hex"), speakerToken: "",
    createdAt: Date.now(), lastSeen: 0, speakerConnected: false,
    commands: [], state: { playing: false, track: "House", currentTime: 0, duration: 0, volume: 0.85 }
  };
  deviceSessions.set(code, session);
  saveDeviceSessions();
  res.json({ ok: true, code, token: session.controllerToken, expiresIn: DEVICE_TTL });
});
app.post("/api/device/join", (req, res) => {
  cleanDeviceSessions();
  const code = String(req.body?.code || "").replace(/\D/g, "").slice(0, 6);
  const session = deviceSessions.get(code);
  if (!session) return res.status(404).json({ error: "That pairing code has expired or does not exist. Create a new code on the controller." });
  if (session.speakerToken) return res.status(409).json({ error: "A speaker is already paired. Disconnect it from the controller first." });
  session.speakerToken = randomBytes(24).toString("hex");
  session.speakerConnected = true;
  session.lastSeen = Date.now();
  saveDeviceSessions();
  res.json({ ok: true, token: session.speakerToken, controllerConnected: true });
});
app.post("/api/device/command", (req, res) => {
  const session = findDeviceByToken(req.body?.token, "controller");
  if (!session) return res.status(401).json({ error: "Controller is not connected. Refresh and pair the speaker again." });
  const command = req.body?.command;
  const allowed = ["play", "pause", "next", "previous", "volume", "track", "settings", "timer"];
  if (!command || !allowed.includes(command.type)) return res.status(400).json({ error: "Unsupported speaker command." });
  if (command.type === "settings" && (!command.value || typeof command.value !== "object" || Array.isArray(command.value) || JSON.stringify(command.value).length > 5000)) return res.status(400).json({ error: "Invalid assistant settings." });
  if (command.type === "timer" && !((command.action === "cancel") || (command.action === "start" && Number.isFinite(command.duration) && command.duration > 0 && command.duration <= 86400000))) return res.status(400).json({ error: "Choose a timer up to 24 hours, or cancel it." });
  if (command.type === "volume" && (!Number.isFinite(command.value) || command.value < 0 || command.value > 1)) return res.status(400).json({ error: "Volume must be between 0 and 1." });
  if (command.type === "track" && !["House", "SoundHelix One", "SoundHelix Two", "SoundHelix Three"].includes(command.value) && !(typeof command.value === "string" && /^\/api\/music\/file\/[a-f0-9]{24}\.(mp3|wav|ogg|m4a|aac)$/.test(command.value))) return res.status(400).json({ error: "That track is not available." });
  if (command.type === "track" && command.value.startsWith("/api/music/file/") && (typeof command.name !== "string" || !command.name.trim() || command.name.length > 80)) return res.status(400).json({ error: "Give your uploaded track a name." });
  session.commands.push({ id: randomBytes(8).toString("hex"), ...command, at: Date.now() });
  saveDeviceSessions();
  if (session.commands.length > 30) session.commands.splice(0, session.commands.length - 30);
  saveDeviceSessions();
  res.json({ ok: true });
});
app.post("/api/device/poll", (req, res) => {
  const session = findDeviceByToken(req.body?.token, "speaker");
  if (!session) return res.status(401).json({ error: "Speaker pairing has expired. Pair again from this page." });
  session.lastSeen = Date.now();
  session.speakerConnected = true;
  const commands = session.commands.splice(0);
  saveDeviceSessions();
  res.json({ ok: true, commands, controllerConnected: Boolean(session.controllerToken) });
});
app.post("/api/device/heartbeat", (req, res) => {
  const session = findDeviceByToken(req.body?.token, "speaker");
  if (!session) return res.status(401).json({ error: "Speaker pairing has expired." });
  session.lastSeen = Date.now();
  session.speakerConnected = true;
  const input = req.body?.state || {};
  session.state = {
    playing: Boolean(input.playing),
    track: typeof input.track === "string" ? input.track.slice(0, 60) : "House",
    currentTime: Number.isFinite(input.currentTime) ? Math.max(0, input.currentTime) : 0,
    duration: Number.isFinite(input.duration) ? Math.max(0, input.duration) : 0,
    volume: Number.isFinite(input.volume) ? Math.min(1, Math.max(0, input.volume)) : 0.85,
    timerEnd: Number.isFinite(input.timerEnd) && input.timerEnd > Date.now() ? input.timerEnd : 0
  };
  saveDeviceSessions();
  res.json({ ok: true });
});
app.post("/api/device/state", (req, res) => {
  const session = findDeviceByToken(req.body?.token, "controller");
  if (!session) return res.status(401).json({ error: "Controller session expired. Refresh this page to create a new pairing code." });
  const connected = Boolean(session.controllerToken && session.speakerToken && session.speakerConnected && Date.now() - session.lastSeen < 15000);
  res.json({ ok: true, connected, state: session.state, code: session.code, createdAt: session.createdAt });
});
app.post("/api/device/disconnect", (req, res) => {
  const session = findDeviceByToken(req.body?.token, "controller");
  if (!session) return res.status(401).json({ error: "Controller session expired." });
  deviceSessions.delete(session.code);
  saveDeviceSessions();
  res.json({ ok: true });
});

// Personal music uploads are stored on the persistent Render data disk.
app.post("/api/music/upload", express.raw({ type: "audio/*", limit: "40mb" }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length < 1000) return res.status(400).json({ error: "Choose a valid audio file." });
  const mime = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
  const ext = ({ "audio/mpeg":"mp3", "audio/mp3":"mp3", "audio/wav":"wav", "audio/x-wav":"wav", "audio/ogg":"ogg", "audio/mp4":"m4a", "audio/aac":"aac", "audio/x-m4a":"m4a" })[mime];
  if (!ext) return res.status(415).json({ error: "Use an MP3, WAV, OGG, M4A or AAC audio file." });
  const filename = randomBytes(12).toString("hex") + "." + ext;
  const dir = path.join(DATA_DIR, "music");
  try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, filename), req.body, { mode: 0o600 }); }
  catch (error) { console.error("Music upload failed:", error.message); return res.status(500).json({ error: "Could not save that music file. Check the Render persistent disk." }); }
  res.json({ ok: true, name: filename, url: "/api/music/file/" + filename, size: req.body.length });
});
app.get("/api/music/file/:filename", (req, res) => {
  const filename = String(req.params.filename || "");
  if (!/^[a-f0-9]{24}\.(mp3|wav|ogg|m4a|aac)$/.test(filename)) return res.sendStatus(404);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(path.join(DATA_DIR, "music", filename), error => { if (error && !res.headersSent) res.sendStatus(404); });
});

function stripHtml(value) {
  return String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();
}
function decodeSearchUrl(href) {
  try {
    const parsed = new URL(href, "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    return target || (parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "");
  } catch { return ""; }
}
function parseDuckDuckGo(html) {
  const results = [];
  const links = /<a\b(?=[^>]*\bclass=["'][^"']*\bresult__a\b[^"']*["'])[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = links.exec(html)) && results.length < 6) {
    const title = stripHtml(match[2]);
    const url = decodeSearchUrl(match[1]);
    if (!title || !url || results.some(item => item.url === url)) continue;
    results.push({ title, url, snippet: "" });
  }
  const snippets = [];
  const snippetPattern = /<(?:a|div|span|td|p)\b(?=[^>]*\bclass=["'][^"']*\bresult__snippet\b[^"']*["'])[^>]*>([\s\S]*?)<\/(?:a|div|span|td|p)>/gi;
  while ((match = snippetPattern.exec(html)) && snippets.length < 6) {
    const snippet = stripHtml(match[1]);
    if (snippet) snippets.push(snippet);
  }
  results.forEach((item, i) => item.snippet = snippets[i] || "");
  return results;
}
app.post("/api/ask", async (req, res) => {
  const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
  if (question.length < 3 || question.length > 300) return res.status(400).json({ error: "Ask a question between 3 and 300 characters." });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(question), {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36", "Accept": "text/html,application/xhtml+xml" },
      signal: controller.signal
    });
    if (!upstream.ok) throw new Error("DuckDuckGo returned HTTP " + upstream.status);
    const html = await upstream.text();
    const results = parseDuckDuckGo(html);
    const useful = results.filter(item => item.snippet);
    if (useful.length) {
      const answer = useful.slice(0, 3).map(item => item.snippet).join(" ");
      return res.json({ ok: true, answer: answer.slice(0, 1000), source: useful[0].title, sources: useful.slice(0, 3).map(({title,url}) => ({title,url})) });
    }
    const wikiResponse = await fetch("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(question) + "&format=json&origin=*", {
      headers: { "User-Agent": "RohanAI/1.0 (web search assistant)" }, signal: controller.signal
    });
    if (!wikiResponse.ok) throw new Error("Search providers returned no usable results");
    const data = await wikiResponse.json();
    const first = data.query?.search?.[0];
    if (first) {
      const summaryResponse = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(first.title), {
        headers: { "User-Agent": "RohanAI/1.0 (web search assistant)" }, signal: controller.signal
      });
      if (summaryResponse.ok) {
        const item = await summaryResponse.json();
        if (item.extract) return res.json({ ok: true, answer: item.extract.slice(0, 1000), source: "Wikipedia", sources: [{ title: item.title || first.title, url: item.content_urls?.desktop?.page || "https://en.wikipedia.org/wiki/" + encodeURIComponent(first.title.replace(/ /g, "_")) }] });
      }
    }
    if (results.length) return res.json({ ok: true, answer: "I found search results, but they did not include a readable summary. The first result is " + results[0].title + ".", source: results[0].title, sources: results.slice(0, 3).map(({title,url}) => ({title,url})) });
    return res.json({ ok: true, answer: "I couldn't find a useful answer. Try asking the question another way.", source: "No results" });
  } catch (error) {
    console.error("Web search failed:", error.name, error.message);
    const message = error.name === "AbortError" ? "Web search took too long. Please try again." : "Web search is temporarily unavailable. Please try again.";
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});
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