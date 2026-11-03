import { useState } from 'react'
import { Link } from 'react-router-dom'

const KEY = 'cookie-notice-seen'
const seen = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** The site only uses essential storage (staying signed in), so this is a notice, not a consent form. */
export function CookieNotice() {
  const [show, setShow] = useState(!seen())
  if (!show) return null
  const close = () => { try { localStorage.setItem(KEY, '1') } catch { /* private mode */ } setShow(false) }
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 print:hidden">
      <div className="mx-auto flex max-w-3xl flex-col items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm shadow-lg sm:flex-row sm:items-center">
        <p className="flex-1 text-muted">We only use essential cookies to keep you signed in. No tracking or advertising. <Link to="/privacy" className="text-primary underline">Privacy policy</Link></p>
        <button className="btn-primary" onClick={close}>OK</button>
      </div>
    </div>
  )
}
