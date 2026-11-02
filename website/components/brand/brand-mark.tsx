export type BrandMarkProps = {
  size?: number
  accent?: string
}

export function BrandMark({ size = 20, accent = "#AEBBD6" }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size / 2}
      viewBox="0 0 10 5"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <rect x="6" y="0" width="2" height="1" fill="#F4EFE6" />
      <rect x="4" y="1" width="4" height="1" fill="#F4EFE6" />
      <rect x="2" y="2" width="5" height="1" fill="#F4EFE6" />
      <rect x="1" y="3" width="6" height="1" fill="#F4EFE6" />
      <rect x="0" y="4" width="5" height="1" fill="#F4EFE6" />
      <rect x="8" y="1" width="1" height="1" fill={accent} />
      <rect x="7" y="2" width="2" height="1" fill={accent} />
      <rect x="7" y="3" width="3" height="1" fill={accent} />
      <rect x="5" y="4" width="5" height="1" fill={accent} />
    </svg>
  )
}
