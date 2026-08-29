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

export const IconRisk = () => (
  <svg {...base}>
    <path d="M8 2.6 14.2 13H1.8L8 2.6Z" />
    <path d="M8 6.6v3.1M8 11.4h.01" strokeWidth="1.6" />
  </svg>
)

export const IconClose = () => (
  <svg {...base}>
    <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" />
  </svg>
)

export const IconDownload = () => (
  <svg {...base}>
    <path d="M8 2.5v7.6" />
    <path d="M5.2 7.6 8 10.4l2.8-2.8" />
    <path d="M2.8 11.4v1.3a.8.8 0 0 0 .8.8h8.8a.8.8 0 0 0 .8-.8v-1.3" />
  </svg>
)

export const IconFilter = () => (
  <svg {...base}>
    <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />
  </svg>
)

export const IconList = () => (
  <svg {...base}>
    <path d="M6 4h7.5M6 8h7.5M6 12h7.5" />
    <path d="M2.8 4h.01M2.8 8h.01M2.8 12h.01" strokeWidth="2" />
  </svg>
)

export const IconKeyboard = () => (
  <svg {...base}>
    <rect x="1.8" y="4" width="12.4" height="8" rx="1.4" />
    <path d="M4.4 6.6h.01M7 6.6h.01M9.6 6.6h.01M12 6.6h.01M5.4 9.4h5.2" strokeWidth="1.6" />
  </svg>
)

export const IconCopy = () => (
  <svg {...base}>
    <rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.4" />
    <path d="M10.4 3.4a1.4 1.4 0 0 0-1.4-1.4H4a1.4 1.4 0 0 0-1.4 1.4v5a1.4 1.4 0 0 0 1.4 1.4" />
  </svg>
)

export const IconCheck = () => (
  <svg {...base}>
    <path d="M3.2 8.4 6.4 11.6l6.4-7.2" />
  </svg>
)

export const IconExternal = () => (
  <svg {...base}>
    <path d="M7 3.4H3.9a1.3 1.3 0 0 0-1.3 1.3v7.4a1.3 1.3 0 0 0 1.3 1.3h7.4a1.3 1.3 0 0 0 1.3-1.3V9" />
    <path d="M9.6 2.6h3.8v3.8M13.4 2.6 7.4 8.6" />
  </svg>
)

export const IconGlobe = () => (
  <svg {...base}>
    <circle cx="8" cy="8" r="5.8" />
    <path d="M2.4 8h11.2M8 2.2c1.6 1.7 2.4 3.7 2.4 5.8s-.8 4.1-2.4 5.8c-1.6-1.7-2.4-3.7-2.4-5.8s.8-4.1 2.4-5.8Z" />
  </svg>
)

export const IconSelect = () => (
  <svg {...base}>
    <path d="M2.6 5.4V3.6a1 1 0 0 1 1-1h1.8M10.6 2.6h1.8a1 1 0 0 1 1 1v1.8M13.4 10.6v1.8a1 1 0 0 1-1 1h-1.8M5.4 13.4H3.6a1 1 0 0 1-1-1v-1.8" />
    <path d="M6 6h4v4H6z" strokeDasharray="1.6 1.4" />
  </svg>
)

export const IconMoney = () => (
  <svg {...base}>
    <rect x="1.8" y="4" width="12.4" height="8" rx="1.4" />
    <circle cx="8" cy="8" r="2" />
    <path d="M4.4 8h.01M11.6 8h.01" strokeWidth="1.8" />
  </svg>
)

export const IconAir = () => (
  <svg {...base}>
    <path d="M2.4 5.6h6.8a2 2 0 1 0-2-2" />
    <path d="M2.4 8.6h8.4a2 2 0 1 1-2 2" />
    <path d="M2.4 11.6h4.6" />
  </svg>
)
