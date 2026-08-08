import { forwardRef } from 'react'

/** Discourage browsers / password managers from offering to save the shared gate code. */
export const MASTER_PASSWORD_FIELD_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  name: 'cms-master-gate',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-np-ignore': 'true',
}

const supportsDiscMask = typeof CSS !== 'undefined'
  && typeof CSS.supports === 'function'
  && CSS.supports('-webkit-text-security', 'disc')

/**
 * Masked master-password field that avoids a native password input when possible,
 * so Chrome/Edge do not prompt to store the shared master password.
 *
 * @param {object} props
 * @param {boolean} [props.showPlain] — show characters (eye toggle)
 */
const MasterPasswordInput = forwardRef(function MasterPasswordInput({
  showPlain = false,
  style,
  className,
  ...rest
}, ref) {
  // Prefer text + CSS disc mask (no password-manager save prompt).
  // Fall back to type=password only when the browser cannot mask text.
  const useTextMask = supportsDiscMask || showPlain
  return (
    <input
      ref={ref}
      type={useTextMask ? 'text' : 'password'}
      {...MASTER_PASSWORD_FIELD_PROPS}
      autoComplete={useTextMask ? 'off' : 'new-password'}
      className={className}
      {...rest}
      style={{
        ...style,
        WebkitTextSecurity: showPlain || !useTextMask ? 'none' : 'disc',
      }}
    />
  )
})

export default MasterPasswordInput
