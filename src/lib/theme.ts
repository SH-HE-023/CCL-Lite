export interface ThemePreset {
  key: string
  label: string
  primary: string
  secondary: string
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: 'lime', label: '三色', primary: '#C6F24E', secondary: '#F0F1E8' },
  { key: 'grass', label: '草方块', primary: '#6CC24A', secondary: '#E3B778' },
  { key: 'ocean', label: '深海礁', primary: '#37B6C4', secondary: '#E0C879' },
  { key: 'lava', label: '熔岩', primary: '#E8654A', secondary: '#F0B45A' },
  { key: 'end', label: '末地', primary: '#9A6BE0', secondary: '#58C9B9' },
  { key: 'snow', label: '雪原', primary: '#7FB6E3', secondary: '#D8E6F0' },
  { key: 'desert', label: '沙漠', primary: '#D8A24A', secondary: '#6CC24A' },
]

function parseHex(hex: string): [number, number, number] {
  const text = (hex || '#6CC24A').replace('#', '')
  if (text.length === 3) {
    return [parseInt(text[0] + text[0], 16), parseInt(text[1] + text[1], 16), parseInt(text[2] + text[2], 16)]
  }
  return [parseInt(text.slice(0, 2), 16), parseInt(text.slice(2, 4), 16), parseInt(text.slice(4, 6), 16)]
}

function clamp(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

function triplet(hex: string): string {
  return parseHex(hex).map(clamp).join(' ')
}

/** 与目标色（0=黑，255=白）混合，返回 CSS 变量用的 "r g b" */
function mix(hex: string, target: number, amount: number): string {
  return parseHex(hex)
    .map((channel) => clamp(channel + (target - channel) * amount))
    .join(' ')
}

/** 把主色 / 辅色写入 CSS 变量，深浅色由主色自动推导 */
export function applyTheme(primary: string, secondary: string): void {
  const root = document.documentElement.style
  root.setProperty('--grass', triplet(primary))
  root.setProperty('--grass-deep', mix(primary, 0, 0.38))
  root.setProperty('--grass-soft', mix(primary, 255, 0.34))
  root.setProperty('--sand', triplet(secondary))
  root.setProperty('--sand-deep', mix(secondary, 0, 0.3))
}
