import { useEffect, useState } from 'react'

/**
 * Below this the desktop chrome stops being a small version of itself and
 * starts being a broken one: the rail plus the vertical legend alone take
 * 160 px, which is most of a phone.
 */
const QUERY = '(max-width: 900px)'

export function useIsMobile(): boolean {
  const [is, setIs] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setIs(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return is
}
