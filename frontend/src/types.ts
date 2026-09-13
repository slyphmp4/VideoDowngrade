export type PresetKey = 'slight' | 'messenger' | 'bad_phone' | 'destroyed'

export type Settings = {
  fps: number
  height: number
  crf: number
  downscale: number
  blur: number
  audio_bitrate: number
  sample_rate: number
  channels: number
  highpass: number
  lowpass: number
}

export type Job = {
  id: string
  filename: string
  status: 'queued' | 'probing' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  output_filename: string | null
  error: string | null
}
