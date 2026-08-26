import { useState } from 'react'
import { IconKeyboard } from './icons'

const KEYS: [string, string][] = [
  ['1 – 4', 'Canopy, Heat, People, Priority'],
  ['Q W E', 'Model Town, Gulberg, DHA'],
  ['← →', 'Step through years'],
  ['↑ ↓', 'Walk the ranked sites'],
  ['L', 'Show or hide the ranked list'],
  ['B', 'Map or satellite'],
  ['D', 'Light or dark'],
  ['M', 'Method'],
  ['Esc', 'Clear selection'],
]

export function Shortcuts() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="kbdBtn"
        aria-expanded={open}
        title="Keyboard shortcuts"
        aria-label="Keyboard shortcuts"
        onClick={() => setOpen((v) => !v)}
      >
        <IconKeyboard />
      </button>

      {open && (
        <div className="kbdPanel" role="dialog" aria-label="Keyboard shortcuts">
          <h2 className="t-label kbdPanel__title">Keyboard</h2>
          <dl className="kbdPanel__list">
            {KEYS.map(([k, what]) => (
              <div key={k}>
                <dt><kbd>{k}</kbd></dt>
                <dd className="t-unit">{what}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  )
}
