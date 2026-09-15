import { useEffect, useState } from 'react'
import { listLocalReports, loadPublicLog, type Report } from './reports'
import { useApp } from '../state/store'

export interface ReportSet {
  /** Committed to public/data/reports.json — everyone sees these. */
  published: Report[]
  /** This browser only, not submitted anywhere. */
  drafts: Report[]
  /** Both, newest first, for drawing on the map. */
  all: Report[]
  publishedAt: string
  loading: boolean
}

const EMPTY: ReportSet = {
  published: [], drafts: [], all: [], publishedAt: '', loading: true,
}

/**
 * The two tiers of the log, kept separate all the way to the UI.
 *
 * A draft and a published report are not the same claim — one is a record
 * anybody can check, the other is a note on one device — so they are never
 * merged into a single undifferentiated list. `all` exists only for the map
 * layer, which marks the two differently.
 *
 * A draft whose id already appears in the public log has been committed, so it
 * is dropped from the draft list rather than shown twice.
 */
export function useReports(): ReportSet {
  const version = useApp((s) => s.reportsVersion)
  const [set, setSet] = useState<ReportSet>(EMPTY)

  useEffect(() => {
    let live = true
    Promise.all([loadPublicLog(), listLocalReports()]).then(([log, local]) => {
      if (!live) return
      const publishedIds = new Set(log.reports.map((r) => r.id))
      const drafts = local.filter((r) => !publishedIds.has(r.id))
      setSet({
        published: log.reports,
        drafts,
        all: [...log.reports, ...drafts].sort((a, b) => b.at.localeCompare(a.at)),
        publishedAt: log.generated,
        loading: false,
      })
    })
    return () => {
      live = false
    }
  }, [version])

  return set
}
