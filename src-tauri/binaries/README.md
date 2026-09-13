# Bundled FFmpeg sidecars

For local Windows development run `scripts/fetch-ffmpeg.ps1` from the repository root.

Tauri expects:

- `ffmpeg-x86_64-pc-windows-msvc.exe`
- `ffprobe-x86_64-pc-windows-msvc.exe`

The GitHub Actions release workflow downloads these automatically before building the installer.
