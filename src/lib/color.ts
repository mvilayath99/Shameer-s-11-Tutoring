/** Mix a hex colour with white to get a soft tint for backgrounds. */
export function tint(hex: string, amount = 0.88) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return '#EEF3F6'
  const mix = (c: string) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount)
  return `#${[m[1], m[2], m[3]].map((c) => mix(c).toString(16).padStart(2, '0')).join('')}`
}
