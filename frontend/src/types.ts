export type PresetKey = 'slight' | 'messenger' | 'bad_phone' | 'destroyed'

export type Settings = {
  fps: number
  height: number
  crf: number
  downscale: number
  blur: number
  color_retention: number
  audio_bitrate: number
  sample_rate: number
  channels: number
  highpass: number
  lowpass: number
}

export type CustomPreset = {
  id: string
  name: string
  settings: Settings
}

export type HistoryEntry = {
  id: string
  created_at: number
  input_path: string
  output_path: string
  settings: Settings
}

export type AppPreferences = {
  auto_preview_processed: boolean
  motion_enabled: boolean
  default_preset: PresetKey
}

export type VideoInfo = {
  width: number
  height: number
  duration: number
  has_audio: boolean
  file_size: number
  filename: string
}

export type Job = {
  id: string
  filename: string
  status: 'queued' | 'probing' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  output_filename: string | null
  error: string | null
}
