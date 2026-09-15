import { useEffect, useState } from 'react'
import { loadRecent } from './recent'
import { evaluate, loadWatches } from './watches'
import { useApp } from '../state/store'

/**
 * How many unacknowledged alerts the watched areas are raising.
 *
 * Only used to badge the tool button, and only counts *unseen* events on
 * *watched* areas — never the total number of detected losses. Badging every
 * detection would make the button permanently decorated, which is how a badge
 * stops meaning anything and starts being something people learn to ignore.
 */
export function useUnseenAlerts(): number {
  const region = useApp((s) => s.region)
  const watchVersion = useApp((s) => s.watchVersion)
  const [n, setN] = useState(0)

  useEffect(() => {
    let live = true
    loadRecent(region).then((doc) => {
      if (!live) return
      if (!doc) {
        setN(0)
        return
      }
      const total = loadWatches()
        .filter((w) => w.region === region)
        .reduce((sum, w) => sum + evaluate(w, doc.events).unseen.length, 0)
      setN(total)
    })
    return () => {
      live = false
    }
  }, [region, watchVersion])

  return n
}
