import { forwardRef } from 'react'

/**
 * Attributes that discourage browsers / password managers from saving or autofilling.
 * Prefer this on every password prompt in the CMS — users must type manually.
 */
export const NO_STORE_PASSWORD_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'off',
  spellCheck: false,
  name: 'cms-manual-secret',
  'data-lpignore': 'true',
  'data-1p-ignore': 'true',
  'data-bwignore': 'true',
  'data-form-type': 'other',
  'data-np-ignore': 'true',
  'data-protonpass-ignore': 'true',
}

/** @deprecated Use NO_STORE_PASSWORD_PROPS */
export const MASTER_PASSWORD_FIELD_PROPS = NO_STORE_PASSWORD_PROPS

const supportsDiscMask = typeof CSS !== 'undefined'
  && typeof CSS.supports === 'function'
  && CSS.supports('-webkit-text-security', 'disc')

/**
 * Masked secret field that avoids a native password input when possible,
 * so Chrome/Edge/password managers do not prompt to store or autofill.
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
      {...NO_STORE_PASSWORD_PROPS}
      // new-password is less likely to autofill than current-password when type=password
      autoComplete={useTextMask ? 'off' : 'new-password'}
      className={['cms-no-store-pw', className].filter(Boolean).join(' ')}
      {...rest}
      style={{
        ...style,
        WebkitTextSecurity: showPlain || !useTextMask ? 'none' : 'disc',
      }}
    />
  )
})

export default MasterPasswordInput

/** Alias — same component for login / flush / user create / master gates. */
export { MasterPasswordInput as NoStorePasswordInput }
