import { useNavigate } from 'react-router-dom'
import { Settings, ArrowLeft } from 'lucide-react'
import PageHeader from '../components/ui/PageHeader'

export default function PrintCornerSettingsPage() {
  const navigate = useNavigate()

  return (
    <div className="page-container">
      <PageHeader
        icon={Settings}
        title="Print Corner Settings"
        subtitle="Categories, subcategories, and Word template uploads — coming next"
      >
        <button
          type="button"
          onClick={() => navigate('/print-corner')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            background: 'var(--card-bg)', border: '1.5px solid var(--card-border)', borderRadius: 8,
            fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--text-2)',
          }}
        >
          <ArrowLeft size={14} /> Back
        </button>
      </PageHeader>

      <div style={{
        padding: 20, background: 'var(--card-bg)', border: '1px solid var(--card-border)',
        borderRadius: 10, fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6,
      }}>
        <p style={{ marginTop: 0 }}>
          This page will manage categories (grab rail), Word template uploads, and variable labels.
        </p>
        <p>
          For now, upload <code>.docx</code> files in Supabase Storage → bucket <strong>print-corner</strong>
          under <code>templates/...</code> and set <code>storage_path</code> on the template row.
        </p>
        <p style={{ marginBottom: 0 }}>
          See <strong>docs/PRINT_CORNER_CLOUDCONVERT_SETUP.md</strong> for CloudConvert + Supabase secrets and deploy steps.
        </p>
      </div>
    </div>
  )
}
