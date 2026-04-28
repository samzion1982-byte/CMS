/**
 * Family Card Print Component
 * A4 Landscape format with specific margin requirements:
 * - Top: 1 inch (25.4mm)
 * - Left, Right, Bottom: 0.75 inch (19.05mm)
 */

export function FamilyCardPrint({
  family,
  members = [],
  church,
  churchLogo,
  dioceseLogo,
  headPhoto,
  style = {}
}) {
  // A4 Landscape: 297mm x 210mm
  // Convert inches to mm: 1 inch = 25.4mm, 0.75 inch = 19.05mm
  const marginTop = 25.4
  const marginSides = 19.05
  const marginBottom = 19.05
  const pageWidth = 297
  const pageHeight = 210
  const contentWidth = pageWidth - marginSides * 2
  const contentHeight = pageHeight - marginTop - marginBottom

  const defaultStyle = {
    width: '100%',
    maxWidth: '100%',
    backgroundColor: '#fff',
    fontFamily: "'Arial', 'Helvetica', sans-serif",
    fontSize: '11px',
    color: '#000',
    margin: '0',
    padding: '0',
  }

  return (
    <div
      style={{
        ...defaultStyle,
        ...style,
        // Print-friendly styles
        pageBreakAfter: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      {/* OUTER BORDER CONTAINER */}
      <div
        style={{
          border: '2px solid #000',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        {/* HEADER SECTION */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '2px solid #000',
            gap: '12px',
          }}
        >
          {/* Left Logo */}
          <div
            style={{
              width: '60px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {churchLogo && (
              <img
                src={churchLogo}
                alt="Church Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            )}
          </div>

          {/* Center Header Text */}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div
              style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#000',
                marginBottom: '2px',
              }}
            >
              {church?.church_name || 'CSITA St. Paul\'s Pastorate'}
            </div>
            <div
              style={{
                fontSize: '10px',
                color: '#000',
                marginBottom: '2px',
              }}
            >
              {[church?.address, church?.city, church?.state, church?.pincode]
                .filter(Boolean)
                .join(', ')}
            </div>
            <div
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#d32f2f',
                fontStyle: 'italic',
                marginTop: '4px',
              }}
            >
              Family Card
            </div>
          </div>

          {/* Right Logo */}
          <div
            style={{
              width: '60px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {dioceseLogo && (
              <img
                src={dioceseLogo}
                alt="Diocese Logo"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                }}
              />
            )}
          </div>
        </div>

        {/* INFORMATION SECTION */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 80px',
            gap: '12px',
            padding: '10px 12px',
            borderBottom: '1px solid #ccc',
            fontSize: '10px',
          }}
        >
          {/* Left Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <InfoRow
              label="Card Serial No."
              value={family?.serial_no || '-'}
            />
            <InfoRow
              label="Family ID"
              value={family?.family_id || '-'}
            />
            <InfoRow
              label="Family Head Name"
              value={family?.head_name || '-'}
            />
            <div style={{ marginTop: '4px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
                Address
              </div>
              <div
                style={{
                  paddingLeft: '20px',
                  fontSize: '9px',
                  lineHeight: '1.3',
                }}
              >
                {(family?.address_parts || []).map((part, idx) => (
                  <div key={idx}>{part}</div>
                ))}
              </div>
            </div>
            <InfoRow
              label="Contact No."
              value={family?.contact || '-'}
            />
          </div>

          {/* Middle Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <InfoRow
              label="Year"
              value={String(new Date().getFullYear())}
            />
            <InfoRow
              label="Family Head ID"
              value={family?.head_member_id || '-'}
            />
            <InfoRow
              label="Membership"
              value={family?.membership || 'Primary'}
            />
            <InfoRow
              label="FBRF"
              value={family?.fbrf || 'No'}
            />
            <div style={{ fontSize: '8px', color: '#666', fontStyle: 'italic' }}>
              Family Benefit Relief Fund
            </div>
            <InfoRow
              label="Email ID"
              value={family?.email || '-'}
            />
          </div>

          {/* Photo Section */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #0066cc',
              backgroundColor: '#f5f5f5',
              height: '80px',
              overflow: 'hidden',
            }}
          >
            {headPhoto ? (
              <img
                src={headPhoto}
                alt="Family Head"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div style={{ fontSize: '24px', color: '#ccc' }}>📷</div>
            )}
          </div>
        </div>

        {/* TABLE SECTION HEADER */}
        <div
          style={{
            padding: '8px 12px',
            fontWeight: 'bold',
            fontSize: '10px',
            fontStyle: 'italic',
            borderBottom: '1px solid #ccc',
          }}
        >
          Family Members Detail
        </div>

        {/* TABLE */}
        <div
          style={{
            padding: '6px 12px',
            flex: 1,
            overflowY: 'auto',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '9px',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#e6e6f0' }}>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  S.No
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Member ID
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'left',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Member's Name
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Relationship
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  DoB
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Age
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  DoM
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Qualification
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Profession
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Mobile No.
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Baptism Status
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Baptism Date
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Confirmation Status
                </th>
                <th
                  style={{
                    border: '1px solid #999',
                    padding: '4px 2px',
                    textAlign: 'center',
                    fontWeight: 'bold',
                    fontSize: '8px',
                  }}
                >
                  Confirmation Date
                </th>
              </tr>
            </thead>
            <tbody>
              {members && members.length > 0 ? (
                members.map((member, idx) => (
                  <tr key={idx}>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.member_id || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        fontSize: '9px',
                      }}
                    >
                      {member.member_name || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.relationship_with_fh || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {formatDate(member.dob_actual || member.dob_certificate)}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {calculateAge(member.dob_actual || member.dob_certificate) || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {formatDate(member.date_of_marriage)}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.qualification || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.profession || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.mobile || '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.baptism_status === true
                        ? 'Yes'
                        : member.baptism_status === false
                        ? 'No'
                        : '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {formatDate(member.baptism_date)}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {member.confirmation_status === true
                        ? 'Yes'
                        : member.confirmation_status === false
                        ? 'No'
                        : '-'}
                    </td>
                    <td
                      style={{
                        border: '1px solid #ccc',
                        padding: '3px 2px',
                        textAlign: 'center',
                        fontSize: '9px',
                      }}
                    >
                      {formatDate(member.confirmation_date)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="14"
                    style={{
                      border: '1px solid #ccc',
                      padding: '8px',
                      textAlign: 'center',
                      fontSize: '9px',
                      color: '#999',
                    }}
                  >
                    No family members
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER SECTION */}
        <div
          style={{
            borderTop: '1px solid #ccc',
            padding: '6px 12px',
            fontSize: '9px',
          }}
        >
          <div style={{ marginBottom: '4px' }}>
            <span style={{ fontWeight: 'bold' }}>Declaration :</span>
            <span style={{ marginLeft: '8px' }}>
              The particulars given above are true to the best of my knowledge. I hereby authorise the pastorate to use any of these particulars for church use.
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginTop: '24px',
              paddingRight: '12px',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  height: '40px',
                  marginBottom: '4px',
                  borderTop: '1px solid #000',
                }}
              />
              <div style={{ fontWeight: 'bold', fontSize: '9px' }}>
                Family Head Signature
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper Components
function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <div style={{ fontWeight: 'bold', minWidth: '120px' }}>{label} :</div>
      <div style={{ flex: 1 }}>{value}</div>
    </div>
  )
}

// Helper Functions
function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return '-'
    const day = String(date.getDate()).padStart(2, '0')
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const year = date.getFullYear()
    return `${day}-${month}-${year}`
  } catch {
    return '-'
  }
}

function calculateAge(dateStr) {
  if (!dateStr) return null
  try {
    const birthDate = new Date(dateStr)
    if (isNaN(birthDate.getTime())) return null
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--
    }
    return age
  } catch {
    return null
  }
}
