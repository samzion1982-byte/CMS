import { Calendar } from 'lucide-react'

export default function EventPlannerPage() {
  return (
    <div style={{ padding: '32px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Calendar size={22} style={{ color: 'var(--accent, #2563eb)' }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Event Planner</h1>
      </div>
      <div style={{
        background: 'var(--card-bg, #fff)',
        border: '1px solid var(--border, #e2e8f0)',
        borderRadius: 12,
        padding: '48px 32px',
        textAlign: 'center',
        color: 'var(--text-muted, #94a3b8)',
      }}>
        <Calendar size={48} style={{ opacity: 0.25, marginBottom: 16 }} />
        <p style={{ fontSize: 15, fontWeight: 500 }}>Event Planner — coming soon</p>
      </div>
    </div>
  )
}
