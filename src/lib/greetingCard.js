/* ═══════════════════════════════════════════════════════════════
   greetingCard.js — Canvas-based greeting card generation (1080×1080)
   ═══════════════════════════════════════════════════════════════ */

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']

export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return DAYS[new Date(y, m - 1, d).getDay()]
}

async function loadFonts() {
  if (document.getElementById('gc-tamil-font')) {
    await document.fonts.ready
    return
  }
  const link = document.createElement('link')
  link.id = 'gc-tamil-font'
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Tamil:wght@400;700&family=Playfair+Display:ital,wght@0,700;1,700&display=swap'
  document.head.appendChild(link)
  await document.fonts.ready
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ')
  let line = ''
  const lines = []
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word }
    else line = test
  }
  if (line) lines.push(line)
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH))
  return lines.length * lineH
}

function drawCross(ctx, cx, cy, size, color) {
  ctx.fillStyle = color
  const arm = size * 0.12
  ctx.fillRect(cx - arm / 2, cy - size / 2, arm, size)
  ctx.fillRect(cx - size * 0.35, cy - size * 0.15, size * 0.7, arm)
}

function drawDivider(ctx, W, y, color) {
  ctx.save()
  ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.globalAlpha = 0.7
  ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(W - 100, y); ctx.stroke()
  ctx.fillStyle = color; ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.moveTo(W / 2, y - 6); ctx.lineTo(W / 2 + 6, y)
  ctx.lineTo(W / 2, y + 6); ctx.lineTo(W / 2 - 6, y)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

function drawBackground(ctx, W, H) {
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0d0b1e')
  bg.addColorStop(0.45, '#1e0a2e')
  bg.addColorStop(1, '#2d0a14')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const radial = ctx.createRadialGradient(W * 0.3, H * 0.25, 50, W * 0.5, H * 0.5, W * 0.75)
  radial.addColorStop(0, 'rgba(212,175,55,0.08)')
  radial.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, W, H)
}

function drawBorder(ctx, W, H, GOLD) {
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3
  ctx.strokeRect(16, 16, W - 32, H - 32)
  ctx.lineWidth = 1; ctx.globalAlpha = 0.5
  ctx.strokeRect(26, 26, W - 52, H - 52)
  ctx.globalAlpha = 1

  const corner = 40
  const draw = (x, y, dx, dy) => {
    ctx.beginPath(); ctx.moveTo(x + dx * corner, y)
    ctx.lineTo(x, y); ctx.lineTo(x, y + dy * corner); ctx.stroke()
  }
  ctx.lineWidth = 2; ctx.globalAlpha = 0.9
  draw(30, 30, 1, 1); draw(W - 30, 30, -1, 1)
  draw(30, H - 30, 1, -1); draw(W - 30, H - 30, -1, -1)
  ctx.globalAlpha = 1
}

export async function generateGreetingCard({
  type, names, years = 0, churchName, city, address, verse
}) {
  await loadFonts()

  const W = 1080, H = 1080
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  const GOLD   = '#d4af37'
  const WHITE  = '#ffffff'
  const CREAM  = '#f0e6c8'
  const LGOLD  = '#ddc57a'

  drawBackground(ctx, W, H)
  drawBorder(ctx, W, H, GOLD)

  ctx.textAlign = 'center'

  // Cross
  drawCross(ctx, W / 2, 108, 72, GOLD)

  // Church name
  ctx.font = 'bold 38px "Playfair Display", Georgia, serif'
  ctx.fillStyle = WHITE
  ctx.fillText(churchName || 'Church', W / 2, 194)

  // Location
  const loc = [address, city].filter(Boolean).join(', ')
  ctx.font = '22px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = LGOLD
  ctx.fillText(loc, W / 2, 228)

  drawDivider(ctx, W, 258, GOLD)

  // Event heading
  const isBday = type === 'birthday'
  ctx.font = 'italic bold 58px "Playfair Display", Georgia, serif'
  ctx.fillStyle = '#f0c040'
  ctx.fillText(isBday ? 'Happy Birthday!' : 'Happy Anniversary!', W / 2, 332)

  // Names
  ctx.font = 'bold 48px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = WHITE
  ctx.fillText(names, W / 2, 400)

  // Years (anniversary only)
  let verseTopY = 448
  if (!isBday && years > 0) {
    ctx.font = '26px Georgia, serif'
    ctx.fillStyle = GOLD
    ctx.fillText(`${years} Blessed Years Together`, W / 2, 442)
    verseTopY = 470
  }

  drawDivider(ctx, W, verseTopY + 8, GOLD)

  // Verse reference
  const refY = verseTopY + 52
  ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = GOLD
  ctx.fillText(verse?.verse_reference || '', W / 2, refY)

  // English verse
  ctx.font = 'italic 23px Georgia, serif'
  ctx.fillStyle = CREAM
  const engText = verse?.verse_text_english ? `"${verse.verse_text_english}"` : ''
  const engH = engText ? wrapText(ctx, engText, W / 2, refY + 42, 880, 34) : 0

  // Tamil reference + verse
  if (verse?.verse_text_tamil) {
    let tY = refY + 42 + engH + 18
    if (verse.verse_text_tamil_reference) {
      ctx.font = 'bold 20px "Noto Sans Tamil", sans-serif'
      ctx.fillStyle = GOLD
      ctx.fillText(verse.verse_text_tamil_reference, W / 2, tY)
      tY += 30
    }
    ctx.font = '22px "Noto Sans Tamil", sans-serif'
    ctx.fillStyle = LGOLD
    wrapText(ctx, `"${verse.verse_text_tamil}"`, W / 2, tY, 880, 32)
  }

  drawDivider(ctx, W, H - 96, GOLD)

  ctx.font = '20px Georgia, serif'
  ctx.fillStyle = GOLD
  ctx.fillText('With love & blessings', W / 2, H - 58)

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
}
