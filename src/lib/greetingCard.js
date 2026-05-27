/* ═══════════════════════════════════════════════════════════════
   greetingCard.js — Canvas-based greeting card generation (1080×1920)
   ═══════════════════════════════════════════════════════════════ */

const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function getDayOfWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return DAYS[new Date(y, m - 1, d).getDay()]
}

function formatEventDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const sfx = d === 1 || d === 21 || d === 31 ? 'st'
             : d === 2 || d === 22             ? 'nd'
             : d === 3 || d === 23             ? 'rd' : 'th'
  return `${DAYS[date.getDay()]}, ${d}${sfx} ${MONTHS[m - 1]} ${y}`
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

function measureLines(ctx, text, maxW) {
  const words = text.split(' ')
  let line = '', count = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) { count++; line = w } else line = test
  }
  return line ? count + 1 : count
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
    ctx.lineWidth = 0.9; ctx.globalAlpha = 0.55
    ctx.beginPath(); ctx.moveTo(100, y); ctx.lineTo(W / 2 - 28, y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 2 + 28, y); ctx.lineTo(W - 100, y); ctx.stroke()
    ctx.globalAlpha = 1; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(W / 2, y - 14); ctx.lineTo(W / 2, y + 14); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(W / 2 - 9, y - 3); ctx.lineTo(W / 2 + 9, y - 3); ctx.stroke()
  } else if (style === 'triple') {
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

// Manual rounded rect (avoids ctx.roundRect browser compatibility concerns)
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

// Fixed-position gold sparkles — deterministic layout, no randomness
function drawSparkles(ctx, W, H, GOLD) {
  const pts = [
    // Edge accents
    [0.10, 0.13, 14, 0.07], [0.90, 0.11, 12, 0.06],
    [0.05, 0.38, 18, 0.06], [0.94, 0.35, 14, 0.07],
    [0.08, 0.58, 16, 0.07], [0.92, 0.55, 18, 0.06],
    [0.06, 0.80, 14, 0.07], [0.94, 0.77, 16, 0.06],
    [0.18, 0.92, 14, 0.07], [0.82, 0.90, 12, 0.06],
    [0.30, 0.04, 12, 0.08], [0.70, 0.03, 14, 0.07],
    [0.22, 0.97, 14, 0.06], [0.78, 0.95, 12, 0.07],
    // Middle zone — slightly stronger to fill the large empty area
    [0.15, 0.52, 22, 0.11], [0.85, 0.49, 20, 0.10],
    [0.10, 0.63, 18, 0.09], [0.88, 0.60, 22, 0.11],
    [0.20, 0.70, 20, 0.10], [0.80, 0.68, 18, 0.10],
    [0.28, 0.56, 16, 0.08], [0.72, 0.54, 20, 0.09],
    [0.40, 0.48, 18, 0.09], [0.60, 0.48, 16, 0.08],
    [0.50, 0.44, 24, 0.12], [0.50, 0.76, 20, 0.10],
    [0.35, 0.80, 16, 0.08], [0.65, 0.78, 20, 0.09],
  ]
  ctx.save()
  ctx.fillStyle = GOLD
  ctx.textAlign = 'center'
  pts.forEach(([xr, yr, size, alpha]) => {
    ctx.globalAlpha = alpha
    ctx.font = `${size}px serif`
    ctx.fillText('✦', xr * W, yr * H)
  })
  ctx.restore()
}

// Five candles — tallest in centre, tapering outward
function drawBirthdayCandles(ctx, cx, baseY, GOLD) {
  const candles = [
    { off: -96, scale: 0.72 }, { off: -48, scale: 0.90 },
    { off:   0, scale: 1.00 },
    { off:  48, scale: 0.90 }, { off:  96, scale: 0.72 },
  ]
  candles.forEach(({ off, scale }) => {
    const x = cx + off
    const h = 32 * scale, w = 9 * scale, flH = 17 * scale
    ctx.save()
    // Body gradient
    const grad = ctx.createLinearGradient(x - w / 2, baseY - h, x + w / 2, baseY)
    grad.addColorStop(0, '#e8d8a8')
    grad.addColorStop(1, '#c8b870')
    ctx.globalAlpha = 0.88
    ctx.fillStyle = grad
    ctx.fillRect(x - w / 2, baseY - h, w, h)
    // Wax-base glow
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.30
    ctx.beginPath()
    ctx.ellipse(x, baseY, w * 0.7, 3 * scale, 0, 0, Math.PI * 2)
    ctx.fill()
    // Wick
    ctx.globalAlpha = 0.8; ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5 * scale
    ctx.beginPath(); ctx.moveTo(x, baseY - h); ctx.lineTo(x, baseY - h - 5 * scale); ctx.stroke()
    // Flame glow halo
    ctx.globalAlpha = 0.18; ctx.fillStyle = '#ffaa00'
    ctx.beginPath()
    ctx.ellipse(x, baseY - h - flH * 0.5, flH * 0.75, flH * 1.0, 0, 0, Math.PI * 2)
    ctx.fill()
    // Flame outer (teardrop)
    ctx.globalAlpha = 0.88; ctx.fillStyle = '#ff8c00'
    ctx.beginPath()
    ctx.moveTo(x, baseY - h - flH)
    ctx.quadraticCurveTo(x + flH * 0.42, baseY - h - flH * 0.5, x, baseY - h)
    ctx.quadraticCurveTo(x - flH * 0.42, baseY - h - flH * 0.5, x, baseY - h - flH)
    ctx.fill()
    // Flame inner
    ctx.globalAlpha = 0.92; ctx.fillStyle = '#fff070'
    ctx.beginPath()
    ctx.moveTo(x, baseY - h - flH * 0.85)
    ctx.quadraticCurveTo(x + flH * 0.20, baseY - h - flH * 0.42, x, baseY - h - 2)
    ctx.quadraticCurveTo(x - flH * 0.20, baseY - h - flH * 0.42, x, baseY - h - flH * 0.85)
    ctx.fill()
    ctx.restore()
  })
}

// Two interlocking gold rings with a diamond accent
function drawAnniversaryRings(ctx, cx, cy, GOLD) {
  const r = 30, gap = 14
  const lx = cx - gap / 2, rx = cx + gap / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = 10
  ctx.strokeStyle = GOLD; ctx.lineWidth = 5; ctx.globalAlpha = 0.92
  ctx.beginPath(); ctx.arc(lx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.beginPath(); ctx.arc(rx, cy, r, 0, Math.PI * 2); ctx.stroke()
  ctx.shadowBlur = 0
  // Shimmer highlight
  ctx.strokeStyle = '#fff5c0'; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.45
  ctx.beginPath(); ctx.arc(lx - 8, cy - 8, r, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke()
  ctx.beginPath(); ctx.arc(rx - 8, cy - 8, r, Math.PI * 1.05, Math.PI * 1.55); ctx.stroke()
  // Central diamond
  ctx.fillStyle = GOLD; ctx.globalAlpha = 1
  ctx.shadowColor = 'rgba(212,175,55,0.55)'; ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(cx, cy - 9); ctx.lineTo(cx + 9, cy)
  ctx.lineTo(cx, cy + 9); ctx.lineTo(cx - 9, cy)
  ctx.closePath(); ctx.fill()
  ctx.restore()
}

// 20 elegant dark gradient themes — one picked randomly per card
const GRADIENT_THEMES = [
  { stops:['#0d0b1e','#1e0a2e','#2d0a14'], dir:[0,0,1,1], glow:'rgba(212,175,55,0.10)' },
  { stops:['#03031a','#0d0b38','#1a0532'], dir:[0,0,1,1], glow:'rgba(120,90,255,0.09)' },
  { stops:['#020f08','#0a1f12','#021408'], dir:[0,1,1,0], glow:'rgba(50,180,100,0.08)' },
  { stops:['#120508','#2a0815','#0f0308'], dir:[0,0,0,1], glow:'rgba(220,80,120,0.09)' },
  { stops:['#030d12','#051d25','#010a10'], dir:[0,0,1,1], glow:'rgba(30,180,200,0.08)' },
  { stops:['#0f0320','#1e0840','#0a0318'], dir:[1,0,0,1], glow:'rgba(160,80,255,0.10)' },
  { stops:['#080c14','#121c30','#050810'], dir:[0,0,1,1], glow:'rgba(80,130,220,0.09)' },
  { stops:['#130c06','#251808','#100a05'], dir:[0,0,1,1], glow:'rgba(200,130,50,0.11)' },
  { stops:['#031208','#082515','#020e06'], dir:[1,1,0,0], glow:'rgba(30,200,120,0.08)' },
  { stops:['#140610','#28102a','#120414'], dir:[0,0,1,1], glow:'rgba(220,80,160,0.09)' },
  { stops:['#020408','#060c1e','#020408'], dir:[0,0,0,1], glow:'rgba(50,100,220,0.11)' },
  { stops:['#110820','#1e1038','#0d0518'], dir:[0,0,1,1], glow:'rgba(180,100,220,0.10)' },
  { stops:['#0f0f0f','#1a1a1a','#0a0804'], dir:[0,0,1,1], glow:'rgba(212,175,55,0.15)' },
  { stops:['#020518','#050e35','#020310'], dir:[1,0,0,1], glow:'rgba(60,100,255,0.10)' },
  { stops:['#120800','#251400','#100600'], dir:[0,0,1,1], glow:'rgba(220,150,30,0.11)' },
  { stops:['#060d08','#101e10','#050a05'], dir:[0,1,1,0], glow:'rgba(80,160,80,0.09)' },
  { stops:['#150204','#2a0508','#0d0203'], dir:[0,0,0,1], glow:'rgba(200,40,60,0.08)' },
  { stops:['#020810','#051520','#02080d'], dir:[0,0,1,1], glow:'rgba(20,160,180,0.09)' },
  { stops:['#080508','#100810','#050305'], dir:[1,0,0,1], glow:'rgba(180,50,200,0.10)' },
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
  type, names, years = 0, age = 0, date = '',
  churchName, city, address, verse, backgroundUrl = null
}) {
  await loadFonts()

  const W = 1080, H = 1920
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')

  const GOLD  = '#d4af37'
  const WHITE = '#ffffff'
  const CREAM = '#f0e6c8'
  const LGOLD = '#ddc57a'

  if (backgroundUrl) {
    await new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { ctx.drawImage(img, 0, 0, W, H); resolve() }
      img.onerror = () => { drawBackground(ctx, W, H); resolve() }
      img.src = backgroundUrl
    })
    ctx.fillStyle = 'rgba(0,0,0,0.42)'
    ctx.fillRect(0, 0, W, H)
  } else {
    drawBackground(ctx, W, H)
  }

  drawBorder(ctx, W, H, GOLD)
  drawSparkles(ctx, W, H, GOLD)  // subtle ✦ texture across the card

  ctx.textAlign = 'center'

  // Cross
  drawCross(ctx, W / 2, 168, 96, GOLD)

  // Decorative church header frame — certificate style with corner & edge ornaments
  ctx.save()
  const fX = W / 2 - 350, fY = 272, fW = 700, fH = 164, fR = 22
  // Background fill
  roundedRect(ctx, fX, fY, fW, fH, fR)
  ctx.fillStyle = 'rgba(212,175,55,0.08)'; ctx.fill()
  // Outer border
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.52
  roundedRect(ctx, fX, fY, fW, fH, fR); ctx.stroke()
  // Inner inset border
  ctx.lineWidth = 0.7; ctx.globalAlpha = 0.22
  roundedRect(ctx, fX + 10, fY + 10, fW - 20, fH - 20, Math.max(fR - 3, 2)); ctx.stroke()
  // Center top & bottom: diamond + flanking lines
  ;[[W / 2, fY], [W / 2, fY + fH]].forEach(([ox, oy]) => {
    ctx.fillStyle = GOLD; ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.moveTo(ox, oy - 7); ctx.lineTo(ox + 7, oy)
    ctx.lineTo(ox, oy + 7); ctx.lineTo(ox - 7, oy)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = GOLD; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.45
    ctx.beginPath(); ctx.moveTo(ox - 60, oy); ctx.lineTo(ox - 12, oy); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox + 12, oy); ctx.lineTo(ox + 60, oy); ctx.stroke()
  })
  ctx.restore()

  // Church name
  ctx.font = 'bold 44px "Playfair Display", Georgia, serif'
  ctx.fillStyle = WHITE
  ctx.fillText(churchName || 'Church', W / 2, 332)

  // Location
  const loc = [address, city].filter(Boolean).join(', ')
  ctx.font = '26px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = LGOLD
  ctx.fillText(loc, W / 2, 392)

  const isBday = type === 'birthday'

  // Candles (birthday) or rings (anniversary) — ABOVE the heading
  if (isBday) {
    drawBirthdayCandles(ctx, W / 2, 542, GOLD)
  } else {
    drawAnniversaryRings(ctx, W / 2, 522, GOLD)
  }

  // Event heading with flanking ✦ ornaments
  ctx.save()
  ctx.font = '38px serif'; ctx.fillStyle = GOLD; ctx.globalAlpha = 0.72
  ctx.fillText('✦', W / 2 - 400, 642)
  ctx.fillText('✦', W / 2 + 400, 642)
  ctx.globalAlpha = 1
  ctx.restore()

  ctx.font = 'italic bold 70px "Playfair Display", Georgia, serif'
  ctx.fillStyle = '#f0c040'
  ctx.fillText(isBday ? 'Happy Birthday!' : 'Happy Anniversary!', W / 2, 634)

  // Names
  ctx.font = 'bold 54px "Plus Jakarta Sans", sans-serif'
  ctx.fillStyle = WHITE
  ctx.fillText(names, W / 2, 724)

  // Thin decorative underline below name
  const nameW = Math.min(ctx.measureText(names).width / 2 + 40, 360)
  ctx.save()
  ctx.strokeStyle = GOLD; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4
  ctx.beginPath(); ctx.moveTo(W / 2 - nameW, 746); ctx.lineTo(W / 2 + nameW, 746); ctx.stroke()
  ctx.globalAlpha = 1
  ctx.restore()

  let curY = 776

  // Celebration date
  if (date) {
    ctx.font = '26px "Plus Jakarta Sans", sans-serif'
    ctx.fillStyle = LGOLD
    ctx.globalAlpha = 0.88
    ctx.fillText(formatEventDate(date), W / 2, curY + 10)
    ctx.globalAlpha = 1
    curY += 46
  }

  // Age milestone (birthday only)
  if (isBday && age > 0) {
    ctx.save()
    ctx.font = 'italic 28px "Playfair Display", Georgia, serif'
    ctx.fillStyle = GOLD; ctx.globalAlpha = 0.90
    const milestones = [10,16,18,21,25,30,40,50,60,70,75,80,90,100]
    const sfx = age === 1 ? 'st' : age === 2 ? 'nd' : age === 3 ? 'rd' : 'th'
    const ageMsg = milestones.includes(age)
      ? `✦  Celebrating a Milestone — ${age}${sfx} Birthday!  ✦`
      : `Celebrating ${age} years of God's grace`
    ctx.fillText(ageMsg, W / 2, curY + 10)
    ctx.globalAlpha = 1
    ctx.restore()
    curY += 50
  }

  // Years together (anniversary only)
  if (!isBday && years > 0) {
    ctx.font = '30px Georgia, serif'
    ctx.fillStyle = GOLD
    ctx.fillText(`${years} Blessed Years Together`, W / 2, curY + 16)
    curY += 58
  }

  // Divider before verse
  drawDivider(ctx, W, curY + 12, GOLD, 'dots')
  curY += 64

  // Verse reference
  if (verse?.verse_reference) {
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif'
    ctx.fillStyle = GOLD
    ctx.fillText(verse.verse_reference, W / 2, curY)
    curY += 44
  }

  // English verse
  ctx.font = 'italic 27px Georgia, serif'
  ctx.fillStyle = CREAM
  const engText = verse?.verse_text_english ? `"${verse.verse_text_english}"` : ''
  if (engText) {
    const engH = wrapText(ctx, engText, W / 2, curY, 900, 40)
    curY += engH + 18
  }

  // Tamil reference + verse
  if (verse?.verse_text_tamil) {
    if (verse.verse_text_tamil_reference) {
      ctx.font = 'bold 24px "Noto Sans Tamil", sans-serif'
      ctx.fillStyle = GOLD
      ctx.fillText(verse.verse_text_tamil_reference, W / 2, curY)
      curY += 36
    }
    ctx.font = '26px "Noto Sans Tamil", sans-serif'
    ctx.fillStyle = LGOLD
    const tamilH = wrapText(ctx, `"${verse.verse_text_tamil}"`, W / 2, curY, 900, 38)
    curY += tamilH + 18
  }

  const topDivY = curY + 12
  const botDivY = H - 400
  drawDivider(ctx, W, topDivY, GOLD, 'cross')

  // Greeting message — centred between the two dividers, larger font + subtle glow box
  const bdayMsgs = [
    'May the Almighty God bless you with good health, peace and prosperity!',
    'May God shower you with His grace and fill your life with joy, love and endless blessings!',
    'May the Lord guide your steps, guard your heart and grant you a year filled with His favour!',
    'May this birthday mark the beginning of a year overflowing with God\'s goodness and mercy!',
    'May the Lord\'s light shine upon you and lead you into a season of growth and abundance!',
    'May God\'s unfailing love surround you today and every day of the year ahead!',
    'May the Lord bless you with wisdom, strength and the joy of His presence this year!',
    'May every dream you carry be touched by God\'s grace and brought to beautiful fruition!',
    'May the Lord crown this new year of your life with His faithfulness and tender mercies!',
    'May God fill your heart with gratitude and your days with purpose, love and peace!',
    'May the Lord\'s blessings follow you wherever you go and His peace guard your heart always!',
    'May this year be a testimony of God\'s grace as He opens new doors and fulfils His promises in your life!',
    'May the Lord renew your strength, refresh your spirit and bless you with abundant joy!',
    'May God\'s hand be upon you, guiding you into all the good things He has planned for you!',
    'May the Lord bless the work of your hands and grant you success in all that you do!',
    'May you be surrounded by love, strengthened by faith and blessed beyond measure this year!',
    'May the Lord be your shield and portion, filling each day with His goodness and grace!',
    'May God lead you into a year of new beginnings, answered prayers and overflowing joy!',
    'May the Lord grant you peace that passes all understanding and a heart full of gratitude!',
    'May God\'s mercy be new every morning for you and His blessings never cease!',
  ]
  const anniMsgs = [
    'May the Lord bless your union with abundant love, joy and togetherness!',
    'May God strengthen your bond and fill your home with His peace, laughter and enduring grace!',
    'May the Lord who joined your hearts continue to bless your journey with love and faithfulness!',
    'May your marriage be a beautiful reflection of God\'s love — patient, kind and everlasting!',
    'May the Lord renew your love for each other and deepen your bond with every passing year!',
    'May God bless your home with peace, your hearts with joy and your journey with His guidance!',
    'May the Lord continue to weave His grace through every chapter of your story together!',
    'May your union grow stronger with each year, rooted in faith and filled with His blessings!',
    'May God grant you a love that deepens, a faith that holds firm and a home full of laughter!',
    'May the Lord\'s favour rest upon your marriage and may His love be the foundation of your home!',
    'May every year together bring you closer to each other and closer to God!',
    'May the Lord bless your partnership with wisdom, patience and an unshakeable bond of love!',
    'May your home be a sanctuary of peace, a place of warmth and a testimony of God\'s grace!',
    'May God fill your hearts with fresh gratitude for each other and renew the joy of your union!',
    'May the Lord walk with you hand in hand through every season of your married life!',
    'May your love story continue to inspire all who know you as a testament to God\'s faithfulness!',
    'May the Lord bless you with the gift of growing old together in His love and goodness!',
    'May God\'s peace dwell in your home and His joy be the strength of your marriage!',
    'May the Lord seal your hearts together and bless you with a lifetime of happiness and grace!',
    'May your marriage be a living testimony that what God has joined together, He will also sustain!',
  ]
  const greetingMsg = (isBday ? bdayMsgs : anniMsgs)[Math.floor(Math.random() * 20)]
  const greetFontSize = 36
  const greetLineH    = 52
  ctx.font = `italic ${greetFontSize}px "Playfair Display", Georgia, serif`
  const numLines = measureLines(ctx, greetingMsg, 880)
  const greetH   = numLines * greetLineH
  const greetY   = Math.round((topDivY + botDivY - greetH) / 2) + greetFontSize

  // Subtle gold-tinted glow box behind the greeting
  ctx.save()
  const padX = 60, padY = 42
  roundedRect(ctx, W / 2 - 440, greetY - greetFontSize - padY, 880, greetH + padY * 2, 14)
  ctx.fillStyle = 'rgba(212,175,55,0.06)'; ctx.fill()
  ctx.strokeStyle = GOLD; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.28; ctx.stroke()
  ctx.restore()

  ctx.fillStyle = CREAM
  ctx.font = `italic ${greetFontSize}px "Playfair Display", Georgia, serif`
  wrapText(ctx, greetingMsg, W / 2, greetY, 880, greetLineH)

  // Footer
  drawDivider(ctx, W, botDivY, GOLD, 'triple')

  ctx.font = 'italic 33px "Playfair Display", Georgia, serif'
  ctx.fillStyle = LGOLD
  ctx.fillText('Wishes and Blessings from', W / 2, botDivY + 90)

  ctx.font = '33px Georgia, serif'
  ctx.fillStyle = CREAM
  ctx.fillText('The Presbyter, Secretary, Treasurer and', W / 2, botDivY + 152)

  ctx.font = '33px Georgia, serif'
  ctx.fillStyle = CREAM
  const membersLine = `beloved members of the ${churchName || 'Church'} Congregation`
  wrapText(ctx, membersLine, W / 2, botDivY + 198, 920, 44)

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.92))
}
