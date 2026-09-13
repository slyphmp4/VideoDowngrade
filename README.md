# Degrader — React + Rust web app

A local/self-hosted web app for intentionally degrading video and audio quality.

## Stack

- React 19 + TypeScript
- Vite 8
- Rust + Axum + Tokio
- Native FFmpeg / FFprobe

The browser is only the UI. Files are uploaded to the Rust process, and FFmpeg performs the actual transcode. This avoids the large RAM and performance cost of browser-only FFmpeg/WASM for long videos.

## Requirements

- Node.js 22+
- Rust toolchain (`rustup` / `cargo`)
- FFmpeg and FFprobe either in PATH or in `backend/bin/` (`ffmpeg.exe` + `ffprobe.exe` on Windows)

## Development

### 1. Backend

```bash
cd backend
cargo run
```

Backend: `http://127.0.0.1:8787`

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`.

Vite proxies `/api` to the Rust backend.

## Current V0.1 features

- drag & drop video
- local preview
- dark custom UI
- 4 degradation presets
- manual FPS / CRF / scale / blur controls
- audio bitrate / sample rate / mono-stereo controls
- Rust multipart upload API
- FFprobe analysis
- background FFmpeg job
- live progress polling
- cancel processing
- download result

## Next milestones

1. proper video metadata in the UI
2. before/after preview frames
3. custom preset saving
4. processing history and cleanup
5. WebSocket/SSE progress instead of polling
6. GPU encoders when available
7. auth + quotas for public deployment
8. Docker image and reverse proxy preset

## Important deployment note

V0.1 is meant for local use or a trusted private network. Do not expose it directly to the public internet yet: upload quotas, authentication, disk cleanup, rate limiting, MIME validation, and hardened sandboxing should be added first.
