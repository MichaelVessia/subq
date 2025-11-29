import { useEffect, useRef, useState } from 'react'

export function useContainerSize<T extends HTMLElement = HTMLDivElement>(): {
  containerRef: React.RefObject<T | null>
  width: number
} {
  const containerRef = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateWidth = () => {
      const newWidth = element.clientWidth
      setWidth((prev) => (prev !== newWidth ? newWidth : prev))
    }

    const observer = new ResizeObserver(() => {
      updateWidth()
    })

    observer.observe(element)
    updateWidth()

    // Fallback: also listen to window resize for cases where ResizeObserver
    // doesn't fire (e.g., viewport changes that don't directly resize the element)
    window.addEventListener('resize', updateWidth)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [])

  return { containerRef, width }
}
