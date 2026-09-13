import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { CustomPreset, Settings, VideoInfo } from './types'

const videoFilters = [{
  name: 'Video files',
  extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
}]

export async function chooseVideo(): Promise<string | null> {
  const result = await open({
    multiple: false,
    directory: false,
    filters: videoFilters,
    title: 'Choose a video',
  })
  return typeof result === 'string' ? result : null
}

export async function chooseOutput(defaultPath: string): Promise<string | null> {
  return save({
    defaultPath,
    title: 'Save degraded video',
    filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
  })
}

export function probeVideo(path: string): Promise<VideoInfo> {
  return invoke<VideoInfo>('probe_video', { path })
}

export function startProcessing(inputPath: string, outputPath: string, settings: Settings): Promise<void> {
  return invoke('start_processing', { inputPath, outputPath, settings })
}

export function cancelProcessing(): Promise<void> {
  return invoke('cancel_processing')
}

export function loadCustomPresets(): Promise<CustomPreset[]> {
  return invoke<CustomPreset[]>('load_custom_presets')
}

export function saveCustomPreset(preset: CustomPreset): Promise<CustomPreset[]> {
  return invoke<CustomPreset[]>('save_custom_preset', { preset })
}

export function deleteCustomPreset(id: string): Promise<CustomPreset[]> {
  return invoke<CustomPreset[]>('delete_custom_preset', { id })
}

export function defaultOutputPath(inputPath: string) {
  const slash = Math.max(inputPath.lastIndexOf('/'), inputPath.lastIndexOf('\\'))
  const dir = slash >= 0 ? inputPath.slice(0, slash + 1) : ''
  const name = slash >= 0 ? inputPath.slice(slash + 1) : inputPath
  const stem = name.replace(/\.[^.]+$/, '')
  return `${dir}${stem}_degraded.mp4`
}
