# 🎻 Private Kamancheh Tutor · מורה פרטי לקמנצ׳ה

A self-paced web app for learning the **Azerbaijani Kamancheh** — the bowed
spike fiddle at the heart of mugham music. It guides a complete beginner from
their very first open string to playing real melodies, listening to them play
through the microphone and giving live, in-tune feedback along the way.

The interface is entirely in **Hebrew (RTL)** and is designed for people with
**no technical background** — there is nothing to install, configure, or set up.
Open the page, allow the microphone, and start playing.

---

## ✨ Highlights

- **🎯 Step-by-step curriculum** — a gated learning path (open strings →
  tetrachords → the microtonal *Shur* mode → melodies). Each stage unlocks only
  after the previous one is played in tune. Progress is saved automatically.
- **🎤 Live microphone tuner** — real-time pitch detection with a colour-changing
  "in tune" indicator. It is **microtone-aware**, so it correctly handles
  Eastern intervals like the *koron* quarter-tone that don't exist on a piano.
- **📼 Teacher video library** — watch real lesson recordings with practice
  tools built in: slow the video down **without changing the pitch**, and loop a
  passage until it feels comfortable.
- **🎙️ Turn your own recordings into lessons** — upload an audio file and the
  app transcribes it **in your browser** into a sequence of notes, then plays it
  back with an on-screen fingering guide showing *which string and finger* to
  use for every note.
- **🎶 Interactive fingerboard** — a moving cursor highlights the exact note,
  string, and finger in time with the music.
- **🪕 Maqam-aware** — supports the *Ajam*, *Shur*, and *Rast* modes, including
  their microtonal scale degrees.
- **📱 Mobile-first & offline-friendly** — built to sit on a phone or tablet next
  to your instrument.

---

## 📖 How to Use (no technical knowledge needed)

> The app works in any modern browser on a phone, tablet, or computer. For the
> microphone to work, the page must be opened over a secure (`https://`) address —
> which it always is when you use the published link.

### 1. First launch
When you open the app the first time, a short welcome explains what it does and
mentions that it will ask to use your **microphone** — this is how it listens to
your playing. Your audio never leaves your device and is never saved. Tap
**"בואו נתחיל"** (Let's begin).

### 2. The home screen
You'll see two big buttons:

- **מערך שיעורים (Lesson Path)** — the structured course.
- **ספריית שירים (Song Library)** — videos and songs to practise.

### 3. Following the lesson path
1. Tap **מערך שיעורים**.
2. Tap the first unlocked stage.
3. Tap **הפעלת מיקרופון** (Enable Microphone) and allow access when the browser
   asks.
4. Play the note shown on screen. The circle turns **green** when you're in
   tune — hold it steady until the bar fills and the note is marked ✓.
5. Finish every note in a stage to unlock the next one. 🎉

> Tip: you can revisit any completed stage at any time. To start over, scroll to
> the bottom of the path and tap **איפוס התקדמות** (Reset progress).

### 4. Practising with the song library
- **תרגילי טכניקה / רפרטואר ושירים** — switch between technique exercises and
  repertoire using the two tabs.
- Tap any **video lesson** to watch your teacher. Use the **percentage buttons**
  to slow it down (the pitch stays correct) and **🔁** to loop it.
- To turn one of **your own recordings** into a guided lesson, open the
  **רפרטואר** tab, tap **🎙️ העלאת הקלטה לתרגול** (Upload a recording), and pick an
  audio file (up to 25 MB). The app analyses it and adds it to your repertoire
  with a full fingering guide. Tap it to play along — slow it down or loop a
  phrase just like the videos.

---

## 🛠️ Developer Setup

### Requirements
- [Node.js](https://nodejs.org/) 18+ and npm
- (Optional) the [Vercel CLI](https://vercel.com/docs/cli) to run the serverless
  API locally and to deploy

### Install & run the frontend
```bash
npm install
npm run dev
```
Vite serves the app at `http://localhost:5173` (and on your local network, so you
can open it from a phone on the same Wi-Fi). The microphone works on `localhost`
and over `https` only.

### Running with the API locally
The note-annotation API (`/api/annotate-notes`) is a Vercel serverless function.
To run it alongside the frontend, use the Vercel CLI:
```bash
npm i -g vercel
cp .env.example .env      # then fill in ANTHROPIC_API_KEY
vercel dev
```
> The API is **optional**: it only adds short Hebrew technique cues to
> transcribed notes. With plain `npm run dev` the app still works fully —
> uploads are transcribed and playable, just without the AI-generated cues.

### Build for production
```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

---

## ⚙️ Configuration

Environment variables (see `.env.example`):

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Server | Required for `/api/annotate-notes`. Get one at [console.anthropic.com](https://console.anthropic.com/settings/keys). |
| `APP_ACCESS_TOKEN` | Server | Optional. When set, the API rejects requests that don't send a matching `x-app-token` header — stops the public URL from spending your credits. |
| `VITE_APP_ACCESS_TOKEN` | Client (build-time) | Optional. Set to the **same** value as `APP_ACCESS_TOKEN` so the browser can call the gated API. |

The API also enforces a per-instance **rate limit** and strict input caps, so it
is safe to deploy publicly even without a token.

---

## ☁️ Deployment (Vercel)

1. Import the repository into [Vercel](https://vercel.com/).
2. In **Project Settings → Environment Variables**, add `ANTHROPIC_API_KEY`
   (and, if you want the gate, `APP_ACCESS_TOKEN` + `VITE_APP_ACCESS_TOKEN`).
3. Deploy. Vercel builds the Vite frontend and serves `api/annotate-notes.js`
   as a serverless function automatically.

### Adding the teacher videos
The library lists local recordings by filename. Drop the actual video files into
`public/videos/` using the filenames listed in
`src/components/SongLibrary.jsx` (the `SEED_SONGS` array), or edit that array to
match your own filenames and titles.

---

## 🧱 Architecture

```
self_learning_kamancheh/
├── api/
│   └── annotate-notes.js        # Vercel function: adds Hebrew cues to real notes
├── src/
│   ├── App.jsx                  # View switching + welcome + error boundary
│   ├── components/
│   │   ├── Dashboard.jsx        # Home screen (two destinations)
│   │   ├── CurriculumRoadmap.jsx# Gated lesson path + progress
│   │   ├── StagePractice.jsx    # Tuner-driven note targets per stage
│   │   ├── MelodyPlayer.jsx     # Self-paced melody practice
│   │   ├── AudioTestbed.jsx     # Microphone tuner (pitch + waveform)
│   │   ├── SongLibrary.jsx      # Videos + audio upload/transcription
│   │   ├── SongInstructor.jsx   # Fingering overlay for notes/uploaded audio
│   │   ├── VideoLesson.jsx      # Honest player for teacher videos
│   │   ├── Welcome.jsx          # First-run intro + mic primer
│   │   ├── ConfirmDialog.jsx    # Styled confirm modal
│   │   ├── ErrorBoundary.jsx    # Graceful crash recovery
│   │   └── Toaster.jsx          # Lightweight toast notifications
│   ├── audio/
│   │   ├── pitch.js             # Autocorrelation pitch detection + helpers
│   │   ├── analyzeAudio.js      # In-browser onset/tempo/pitch transcription
│   │   └── kamanchehSampler.js  # Optional sample-based instrument (scaffold)
│   ├── data/
│   │   ├── curriculum.js        # The four learning stages
│   │   └── maqams.js            # Maqam scales + microtonal note resolution
│   └── ui/
│       └── toast.js             # Toast store
└── index.html
```

**Tech:** React 18, Vite 5, the Web Audio API (pitch detection, synthesis, and
client-side transcription run entirely in the browser), and a single Vercel
serverless function backed by the Claude API.

---

## 🎼 A note on transcription

Uploaded audio is transcribed **locally in your browser** using onset detection
and autocorrelation pitch tracking — no audio is uploaded to any server. It is a
practical teaching aid, not a perfect transcription: clean, monophonic
recordings of a single instrument give the best results.

---

## 📄 License

This is a personal project. All rights reserved unless stated otherwise.
