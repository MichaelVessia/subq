export function Tooltip({
  content,
  position,
}: {
  content: React.ReactNode
  position: { x: number; y: number } | null
}) {
  if (!position) return null
  return (
    <div
      className="fixed bg-foreground text-background px-3.5 py-2.5 rounded-md text-xs leading-relaxed pointer-events-none z-[1000] max-w-[220px] shadow-md"
      style={{
        left: position.x + 12,
        top: position.y - 12,
      }}
    >
      {content}
    </div>
  )
}
