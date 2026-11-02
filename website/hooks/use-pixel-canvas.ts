import { useEffect, useRef } from "react"

export type PixelCanvas = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  image: ImageData
  width: number
  height: number
}

export function usePixelCanvas(pixelSize: number, start: (pixels: PixelCanvas) => () => void) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    let stop = () => {}
    let size = ""
    const observer = new ResizeObserver(() => {
      const width = Math.ceil(canvas.clientWidth / pixelSize)
      const height = Math.ceil(canvas.clientHeight / pixelSize)
      if (`${width}x${height}` === size) return

      size = `${width}x${height}`
      stop()
      canvas.width = width
      canvas.height = height
      stop = start({
        canvas,
        context,
        image: context.createImageData(width, height),
        width,
        height,
      })
    })
    observer.observe(canvas)

    return () => {
      observer.disconnect()
      stop()
    }
  }, [pixelSize, start])

  return ref
}
