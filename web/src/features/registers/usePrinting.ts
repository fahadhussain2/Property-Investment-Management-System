import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

/**
 * True while the page is being printed. The browser fires `beforeprint` before it lays out the paper copy, so the
 * state is flushed synchronously there (a normal re-render would come too late for the printout).
 */
export function usePrinting() {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return printing
}
