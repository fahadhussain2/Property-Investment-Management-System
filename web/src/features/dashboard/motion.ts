import { createContext, useContext, useEffect, useState } from 'react'

/**
 * Spec 005 §5: motion plays only when real content replaces a skeleton. `Loaded` provides true in that
 * case; content that was already cached when its block mounted gets false and simply appears.
 */
export const AnimateContext = createContext(false)

export const useAnimateIn = () => useContext(AnimateContext)

const REDUCE = '(prefers-reduced-motion: reduce)'

/** For motion CSS can't gate with `motion-safe:` (Recharts' own animation). */
export function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(REDUCE).matches === true)
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCE)
    if (!mq) return
    const onChange = () => setReduce(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduce
}
