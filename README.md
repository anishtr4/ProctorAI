# ProctorAI

Secure coding assessment platform with AI-powered proctoring.

## Features

- 🎥 **Real-time face tracking** using MediaPipe FaceMesh
- 👁️ **Gaze detection** - Detects when candidates look away from screen
- 💻 **Monaco Editor** - VS Code-powered code editor
- 📝 **Multi-language questions** - JavaScript, Python, Java
- 🔗 **Unique session URLs** - Share with candidates, expires in 24 hours
- ⚡ **Real-time sync** - Interviewer sees candidate's proctoring alerts live
- 🗄️ **Supabase backend** - Session persistence and real-time subscriptions

## Quick Start

```bash
npm install
npm run dev
```

## Environment Variables

Create a `.env` file:
```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase Setup

Run `supabase_schema.sql` in your Supabase SQL Editor to create tables.

## Deploy to Vercel

```bash
vercel --prod
```

Add environment variables in Vercel dashboard.

## Tech Stack

- Vite + Vanilla JS
- MediaPipe FaceMesh
- Monaco Editor
- Supabase (PostgreSQL + Realtime)
