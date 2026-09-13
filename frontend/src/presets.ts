import type { PresetKey, Settings } from './types'

export const presets: Record<PresetKey, { label: string; hint: string; settings: Settings }> = {
  slight: {
    label: 'Soft',
    hint: 'subtle compression',
    settings: { fps: 25, height: 1080, crf: 26, downscale: 0.85, blur: 0, audio_bitrate: 96, sample_rate: 44100, channels: 2, highpass: 0, lowpass: 0 },
  },
  messenger: {
    label: 'Messenger',
    hint: 'shared too many times',
    settings: { fps: 24, height: 720, crf: 31, downscale: 0.58, blur: 0.25, audio_bitrate: 64, sample_rate: 32000, channels: 2, highpass: 0, lowpass: 9000 },
  },
  bad_phone: {
    label: 'Bad phone',
    hint: 'cheap camera / old upload',
    settings: { fps: 22, height: 480, crf: 35, downscale: 0.48, blur: 0.45, audio_bitrate: 40, sample_rate: 22050, channels: 1, highpass: 120, lowpass: 5500 },
  },
  destroyed: {
    label: 'Destroyed',
    hint: 'almost no information left',
    settings: { fps: 20, height: 360, crf: 40, downscale: 0.35, blur: 0.75, audio_bitrate: 24, sample_rate: 16000, channels: 1, highpass: 180, lowpass: 4200 },
  },
}
