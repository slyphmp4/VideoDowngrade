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

export type VideoInfo = {
  width: number
  height: number
  duration: number
  has_audio: boolean
  file_size: number
  filename: string
}
