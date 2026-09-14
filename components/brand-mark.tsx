import Image from 'next/image'

// Item 8: public/icon.svg already existed but every lockup drew its own square with a
// BarChart3 glyph inside instead. One component, the real asset, used everywhere.
export function BrandSymbol({ size = 32 }: { size?: number }) {
  return (
    <Image
      src="/icon.svg"
      alt=""
      width={size}
      height={size}
      className="brand-symbol-img"
      priority={false}
      aria-hidden="true"
    />
  )
}
