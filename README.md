# Rohan AI

An orange-themed Alexa-style assistant website with browser voice recognition, Cartesia Sonic speech, noughts and crosses, original browser-generated music, voice selection and settings.

## Features
- Responsive desktop and mobile dashboard
- Tap-to-talk voice commands and optional “Hey Rohan” wake phrase (browser speech recognition)
- Secure Cartesia text-to-speech proxy; API key stays on the server
- Load and select voices available to your Cartesia account
- Noughts and crosses against an unbeatable minimax opponent
- Three original synthesised soundscapes generated in the browser
- Saved voice, speech speed, speaking volume and preferences

## Deploy on Render
1. Create a new **Web Service** on Render and connect this repository.
2. Render detects `render.yaml`; use `npm install` for build and `npm start` for start.
3. In Render → Environment, add `CARTESIA_API_KEY` with a newly generated Cartesia key. Do not put the key in GitHub.
4. Deploy. Open the Render URL and check Settings → Assistant information shows the key is configured.
5. Open Voice and choose a voice. Allow microphone permission when you first use voice activation.

## Local development
- Install Node.js 20 or later.
- Copy `.env.example` to `.env` and add your Cartesia key.
- Run `npm install`, then `npm start`.
- Open `http://localhost:3000`.

## Voice notes
Voice recognition uses the browser Web Speech API and works best in Chrome or Edge over HTTPS (or localhost). “Hey Rohan” mode listens while the tab remains open; browser and operating-system microphone policies can pause background listening. This is not an always-on device wake-word engine.

Cartesia speech uses the Sonic 3.6 model through a server-side API route. The assistant's built-in commands cover the included app features; open-ended AI chat requires a separate language-model service and key, which is not included in this build.

## Security
- Set `CARTESIA_API_KEY` only in the hosting environment.
- Rotate any API key previously pasted into chat or committed to source control.
- The TTS endpoint has request-size validation and rate limiting.
- Never publish `.env`.
