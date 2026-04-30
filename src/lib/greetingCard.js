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

function drawDivider(ctx, W, y, color, style = 'diamond') {
  ctx.save()
  ctx.strokeStyle = color; ctx.fillStyle = color

  if (style === 'dots') {
    // Row of graduated dots
    const count = 13
    const span = W - 220
    const gap = span / (count - 1)
    for (let i = 0; i < count; i++) {
      const mid = Math.floor(count / 2)
      const dist = Math.abs(i - mid)
      const r = dist === 0 ? 5 : dist === 1 ? 3.5 : dist === 2 ? 2.5 : 1.5
      ctx.globalAlpha = dist === 0 ? 1 : dist <= 2 ? 0.65 : 0.35
      ctx.beginPath()
      ctx.arc(110 + i * gap, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (style === 'cross') {
    // Lines with a small decorative cross in the center
    ctx.lineWidth = 0.9; ctx.globalAlpha = 0.55
    ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(W / 2 - 28, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 2 + 28, y); ctx.lineTo(W - 100, y); ctx.stroke()
    ctx.globalAlpha = 1; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(W / 2, y - 14); ctx.lineTo(W / 2, y + 14); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 2 - 9, y - 3); ctx.lineTo(W / 2 + 9, y - 3); ctx.stroke()
  } else if (style === 'triple') {
    // Thin line with three diamonds
    ctx.lineWidth = 0.7; ctx.globalAlpha = 0.45
    ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(W - 100, y); ctx.stroke()
    ctx.globalAlpha = 1
    ;[-52, 0, 52].forEach(off => {
      const cx = W / 2 + off
      ctx.beginPath()
      ctx.moveTo(cx, y - 5); ctx.lineTo(cx + 5, y)
      ctx.lineTo(cx, y + 5); ctx.lineTo(cx - 5, y)
      ctx.closePath(); ctx.fill()
    })
  } else {
    // Default: line + single diamond
    ctx.lineWidth = 1; ctx.globalAlpha = 0.7
    ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(W - 100, y); ctx.stroke()
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(W / 2, y - 6); ctx.lineTo(W / 2 + 6, y)
    ctx.lineTo(W / 2, y + 6); ctx.lineTo(W / 2 - 6, y)
    ctx.closePath(); ctx.fill()
  }
  ctx.restore()
}

// 20 elegant dark gradient themes — one picked randomly per card
const GRADIENT_THEMES = [
  // 1. Original — navy / deep purple / dark crimson
  { stops:['#0d0b1e','#1e0a2e','#2d0a14'], dir:[0,0,1,1], glow:'rgba(212,175,55,0.10)' },
  // 2. Midnight Indigo
  { stops:['#03031a','#0d0b38','#1a0532'], dir:[0,0,1,1], glow:'rgba(120,90,255,0.09)' },
  // 3. Deep Forest Green
  { stops:['#020f08','#0a1f12','#021408'], dir:[0,1,1,0], glow:'rgba(50,180,100,0.08)' },
  // 4. Dark Burgundy
  { stops:['#120508','#2a0815','#0f0308'], dir:[0,0,0,1], glow:'rgba(220,80,120,0.09)' },
  // 5. Deep Teal Navy
  { stops:['#030d12','#051d25','#010a10'], dir:[0,0,1,1], glow:'rgba(30,180,200,0.08)' },
  // 6. Royal Purple
  { stops:['#0f0320','#1e0840','#0a0318'], dir:[1,0,0,1], glow:'rgba(160,80,255,0.10)' },
  // 7. Dark Slate Blue
  { stops:['#080c14','#121c30','#050810'], dir:[0,0,1,1], glow:'rgba(80,130,220,0.09)' },
  // 8. Dark Copper Bronze
  { stops:['#130c06','#251808','#100a05'], dir:[0,0,1,1], glow:'rgba(200,130,50,0.11)' },
  // 9. Deep Emerald
  { stops:['#031208','#082515','#020e06'], dir:[1,1,0,0], glow:'rgba(30,200,120,0.08)' },
  // 10. Dark Rose Plum
  { stops:['#140610','#28102a','#120414'], dir:[0,0,1,1], glow:'rgba(220,80,160,0.09)' },
  // 11. Midnight Navy
  { stops:['#020408','#060c1e','#020408'], dir:[0,0,0,1], glow:'rgba(50,100,220,0.11)' },
  // 12. Deep Violet
  { stops:['#110820','#1e1038','#0d0518'], dir:[0,0,1,1], glow:'rgba(180,100,220,0.10)' },
  // 13. Black Charcoal Gold
  { stops:['#0f0f0f','#1a1a1a','#0a0804'], dir:[0,0,1,1], glow:'rgba(212,175,55,0.15)' },
  // 14. Deep Cobalt
  { stops:['#020518','#050e35','#020310'], dir:[1,0,0,1], glow:'rgba(60,100,255,0.10)' },
  // 15. Dark Amber Brown
  { stops:['#120800','#251400','#100600'], dir:[0,0,1,1], glow:'rgba(220,150,30,0.11)' },
  // 16. Dark Sage Forest
  { stops:['#060d08','#101e10','#050a05'], dir:[0,1,1,0], glow:'rgba(80,160,80,0.09)' },
  // 17. Midnight Maroon
  { stops:['#150204','#2a0508','#0d0203'], dir:[0,0,0,1], glow:'rgba(200,40,60,0.08)' },
  // 18. Dark Teal Abyss
  { stops:['#020810','#051520','#02080d'], dir:[0,0,1,1], glow:'rgba(20,160,180,0.09)' },
  // 19. Black Velvet Purple
  { stops:['#080508','#100810','#050305'], dir:[1,0,0,1], glow:'rgba(180,50,200,0.10)' },
  // 20. Steel Charcoal Blue
  { stops:['#080a0e','#121620','#060810'], dir:[0,0,1,1], glow:'rgba(150,170,200,0.08)' },
]

function drawBackground(ctx, W, H) {
  const t = GRADIENT_THEMES[Math.floor(Math.random() * GRADIENT_THEMES.length)]
  const [x1r, y1r, x2r, y2r] = t.dir

  const bg = ctx.createLinearGradient(x1r * W, y1r * H, x2r * W, y2r * H)
  bg.addColorStop(0,    t.stops[0])
  bg.addColorStop(0.45, t.stops[1])
  bg.addColorStop(1,    t.stops[2])
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const radial = ctx.createRadialGradient(W * 0.3, H * 0.25, 50, W * 0.5, H * 0.5, W * 0.75)
  radial.addColorStop(0, t.glow)
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
  type, names, years = 0, churchName, city, address, verse, backgroundUrl = null
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

  if (backgroundUrl) {
    await new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, 0, 0, W, H); resolve() }
      img.onerror = () => { drawBackground(ctx, W, H); resolve() }
      img.src = backgroundUrl
    })
    // Dark overlay so text stays readable over any background
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(0, 0, W, H)
  } else {
    drawBackground(ctx, W, H)
  }

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

  drawDivider(ctx, W, 258, GOLD, 'diamond')

  // Event heading
  const isBday = type === 'birthday'
  ctx.font = 'italic bold 58px "Playfair Display", Georgia, serif'
  ctx.fillStyle = '#f0c040'
  ctx.fillText(isBday ? 'Happy Birthday!' : 'Happy Anniversary!', W / 2, 332)

  // Names — right below heading
  ctx.font = 'bold 48px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = WHITE
  ctx.fillText(names, W / 2, 406)

  let curY = 438

  // Years (anniversary only)
  if (!isBday && years > 0) {
    ctx.font = '26px Georgia, serif'
    ctx.fillStyle = GOLD
    ctx.fillText(`${years} Blessed Years Together`, W / 2, curY + 14)
    curY += 48
  }

  // Divider before verse
  drawDivider(ctx, W, curY + 10, GOLD, 'dots')
  curY += 52

  // Verse reference
  if (verse?.verse_reference) {
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif'
    ctx.fillStyle = GOLD
    ctx.fillText(verse.verse_reference, W / 2, curY)
    curY += 38
  }

  // English verse
  ctx.font = 'italic 23px Georgia, serif'
  ctx.fillStyle = CREAM
  const engText = verse?.verse_text_english ? `"${verse.verse_text_english}"` : ''
  if (engText) {
    const engH = wrapText(ctx, engText, W / 2, curY, 880, 34)
    curY += engH + 14
  }

  // Tamil reference + verse
  if (verse?.verse_text_tamil) {
    if (verse.verse_text_tamil_reference) {
      ctx.font = 'bold 20px "Noto Sans Tamil", sans-serif'
      ctx.fillStyle = GOLD
      ctx.fillText(verse.verse_text_tamil_reference, W / 2, curY)
      curY += 32
    }
    ctx.font = '22px "Noto Sans Tamil", sans-serif'
    ctx.fillStyle = LGOLD
    const tamilH = wrapText(ctx, `"${verse.verse_text_tamil}"`, W / 2, curY, 880, 32)
    curY += tamilH + 14
  }

  // Top divider (cross style) right after verse, bottom divider fixed near footer
  const topDivY = curY + 8
  const botDivY = H - 145
  drawDivider(ctx, W, topDivY, GOLD, 'cross')

  // Greeting message — center the visual midpoint of text in the zone between dividers
  const greetingMsg = isBday
    ? 'May the Almighty God bless you with good health, peace and prosperity!'
    : 'May the Lord bless your union with abundant love, joy and togetherness!'
  const greetFontSize = 26
  const greetLineH = 38
  ctx.font = `italic ${greetFontSize}px "Playfair Display", Georgia, serif`
  const greetLines = (() => {
    const words = greetingMsg.split(' ')
    let line = '', n = 0
    for (const w of words) {
      const test = line ? `${line} ${w}` : w
      if (ctx.measureText(test).width > 860 && line) { n++; line = w } else line = test
    }
    return line ? n + 1 : n
  })()
  const greetH = greetLines * greetLineH
  // greetY is the baseline of the first line; add fontSize so visual top is centered
  const greetY = Math.round((topDivY + botDivY - greetH) / 2) + greetFontSize
  ctx.fillStyle = CREAM
  wrapText(ctx, greetingMsg, W / 2, greetY, 860, greetLineH)

  // Footer
  drawDivider(ctx, W, botDivY, GOLD, 'triple')
  ctx.font = '20px Georgia, serif'
  ctx.fillStyle = LGOLD
  ctx.fillText('Wishes and Blessings from', W / 2, botDivY + 38)
  ctx.font = 'bold 24px "Playfair Display", Georgia, serif'
  ctx.fillStyle = GOLD
  ctx.fillText(`${churchName || 'Church'} Congregation`, W / 2, botDivY + 74)

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
}
