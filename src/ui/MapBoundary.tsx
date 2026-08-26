import { Component, type ReactNode } from 'react'

/**
 * A thrown map error must never blank the product. Without this, one bad layer
 * update unmounts the whole tree and the screen goes to bare background —
 * which is exactly what you do not want happening on stage.
 */
export class MapBoundary extends Component<
  { children: ReactNode },
  { message: string | null }
> {
  state = { message: null as string | null }

  static getDerivedStateFromError(e: unknown) {
    return { message: e instanceof Error ? e.message : String(e) }
  }

  render() {
    if (this.state.message === null) return this.props.children
    return (
      <div className="mapfail">
        <div className="mapfail__inner">
          <h2 className="t-label">Map layer failed</h2>
          <p className="t-data mapfail__msg">{this.state.message}</p>
          <button
            type="button"
            className="overture__enter"
            onClick={() => this.setState({ message: null })}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }
}
