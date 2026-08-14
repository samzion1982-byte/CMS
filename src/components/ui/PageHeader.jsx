/**
 * Shared page title row: gradient icon badge + title + subtitle + optional actions.
 */
const ICON_GRADIENT = 'linear-gradient(135deg, #2563eb, #4f46e5)'

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  children,
  className = '',
  style,
}) {
  return (
    <div className={`page-header ${className}`.trim()} style={style}>
      <div>
        <div className="page-header-title-row">
          {Icon && (
            <div
              className="page-header-icon"
              style={{ background: ICON_GRADIENT }}
              aria-hidden
            >
              <Icon size={16} strokeWidth={2.25} />
            </div>
          )}
          <h1 className="page-title" style={{ margin: 0 }}>{title}</h1>
        </div>
        {subtitle != null && subtitle !== false && (
          <p className="page-subtitle page-header-subtitle">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}
