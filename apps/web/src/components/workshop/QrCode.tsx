import { useMemo } from 'react'
import { encode } from 'uqr'

/**
 * QR code drawn as one SVG path (no images, no network). Medium error correction keeps it
 * readable on a slightly creased printed card.
 */
export function QrCode({
  value,
  size = 160,
  label,
  className = '',
}: {
  value: string
  size?: number
  label: string
  className?: string
}) {
  const { path, cells } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 })
    let d = ''
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`
      })
    })
    return { path: d, cells: qr.size }
  }, [value])

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${cells} ${cells}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={cells} height={cells} fill="#ffffff" />
      <path d={path} fill="#111827" />
    </svg>
  )
}
