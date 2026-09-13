# VideoDowngrade

VideoDowngrade is a native Windows desktop app for intentionally degrading video and audio quality in a controlled way.

## Desktop stack

- React + TypeScript + Vite for the interface
- Tauri 2 for the native desktop shell
- Rust for media probing, processing state, progress and cancellation
- Native FFmpeg / FFprobe bundled with release installers

The application does **not** upload the selected video to a web server. React talks directly to the Rust core through Tauri IPC and Rust launches the bundled FFmpeg sidecar against the file on disk.

## Features

- native Windows window — no browser tab or localhost server
- drag and drop video files
- native Open / Save dialogs
- local video preview
- presets: Soft, Messenger, Bad phone, Destroyed
- 20–25 FPS control
- CRF compression control
- downscale → upscale degradation
- blur
- output resolution
- audio bitrate, sample rate and mono/stereo damage
- high-pass / low-pass processing from presets
- live FFmpeg progress
- processing cancellation
- output directly to a user-selected `.mp4`

## Download

Ready-to-install Windows builds are published under **GitHub Releases** as an NSIS `-setup.exe` installer.

## Local development on Windows

Requirements for developers only:

- Node.js 22+
- Rust stable / Cargo
- Microsoft C++ Build Tools required by Tauri

Prepare FFmpeg sidecars:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\fetch-ffmpeg.ps1
```

Install dependencies:

```powershell
npm install
npm --prefix frontend install
```

Run the desktop app in development mode:

```powershell
npm run dev
```

Build an installer locally:

```powershell
npm run build -- --bundles nsis
```

The installer will be created under `src-tauri/target/release/bundle/nsis/`.

## Releases

`.github/workflows/windows-release.yml` builds the Windows x64 app on GitHub Actions, downloads FFmpeg for bundling, and uploads the generated NSIS installer to a GitHub Release.
