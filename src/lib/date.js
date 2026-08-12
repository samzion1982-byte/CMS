function parseIsoDateString(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})/) 
  if (!match) return null
  const [, year, month, day] = match
  return { year: Number(year), month: Number(month), day: Number(day) }
}

export function formatDate(value, empty = '-') {
  if (!value) return empty
  try {
    const parsed = parseIsoDateString(value)
    if (parsed) {
      const day = String(parsed.day).padStart(2, '0')
      const month = String(parsed.month).padStart(2, '0')
      return `${day}-${month}-${parsed.year}`
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return empty
    const day = String(d.getDate()).padStart(2, '0')
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    return `${day}-${month}-${year}`
  } catch {
    return empty
  }
}
