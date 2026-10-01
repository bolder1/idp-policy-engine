import { ensureVO, LINES } from './vo.mjs'
const map = ensureVO(process.argv[2] ?? './voice')
const total = Object.values(map).reduce((a, b) => a + b.duration, 0)
console.log('lines', Object.keys(map).length, 'total speech', total.toFixed(1) + 's')
for (const [id, v] of Object.entries(map)) if (v.duration > 13) console.log('LONG', id, v.duration.toFixed(1))
