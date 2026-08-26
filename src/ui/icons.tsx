/**
 * Hand-drawn 16px line icons. Deliberately not an icon library: four glyphs
 * that mean something specific here (canopy, heat, people, priority) beat a
 * thousand generic ones, and there is no dependency to keep in sync.
 */

const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const IconCanopy = () => (
  <svg {...base}>
    <path d="M8 14V9" />
    <path d="M8 9C5.5 9 3.5 7.4 3.5 5.4 3.5 3.5 5.5 2 8 2s4.5 1.5 4.5 3.4C12.5 7.4 10.5 9 8 9Z" />
    <path d="M6.2 11.2 8 12.4l1.8-1.2" />
  </svg>
)

export const IconHeat = () => (
  <svg {...base}>
    <path d="M9.5 9.1V3.3a1.5 1.5 0 0 0-3 0v5.8a3 3 0 1 0 3 0Z" />
    <path d="M8 11.2v1.4" />
  </svg>
)

export const IconPeople = () => (
  <svg {...base}>
    <circle cx="6" cy="5.6" r="2.2" />
    <path d="M2.5 13.2c0-2 1.6-3.4 3.5-3.4s3.5 1.4 3.5 3.4" />
    <path d="M10.8 4.1a2.2 2.2 0 0 1 0 4.2M11.4 9.9c1.4.4 2.3 1.6 2.3 3.3" />
  </svg>
)

export const IconPriority = () => (
  <svg {...base}>
    <path d="M8 14.5S13 10.6 13 6.9a5 5 0 0 0-10 0C3 10.6 8 14.5 8 14.5Z" />
    <circle cx="8" cy="6.8" r="1.8" />
  </svg>
)

export const IconRegion = () => (
  <svg {...base}>
    <path d="M6 3 2.5 4.4v8.2L6 11.2l4 1.4 3.5-1.4V3L10 4.4 6 3Z" />
    <path d="M6 3v8.2M10 4.4v8.2" />
  </svg>
)

export const IconMethod = () => (
  <svg {...base}>
    <path d="M4 2.5h5.5L12.5 5.5v8h-8.5z" />
    <path d="M9.3 2.5v3.2h3.2M6 9h4M6 11.3h2.6" />
  </svg>
)

export const IconTheme = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="4.6" />
    <path d="M8 3.4v9.2" />
    <path d="M8 3.4a4.6 4.6 0 0 1 0 9.2Z" fill="currentColor" stroke="none" />
  </svg>
)
