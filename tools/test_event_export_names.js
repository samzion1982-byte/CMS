const normalizeNames = value => [...new Set(String(value || '').split(/[;,]+/).map(v => v.trim()).filter(Boolean))]
const parent = normalizeNames('Eben, Dinakar')
const child = normalizeNames('Eben')
console.log('parent:', parent)
console.log('child:', child)
console.log('reports_to:', parent.filter(a => !child.includes(a)).join(', '))
