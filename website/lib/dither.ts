export function bayer(x: number, y: number, bits = 2) {
  const diagonal = x ^ y
  let rank = 0
  for (let bit = 0; bit < bits; bit++) {
    rank = (rank << 2) | (((diagonal >> bit) & 1) << 1) | ((y >> bit) & 1)
  }
  return (rank + 0.5) / (1 << (2 * bits))
}

export function createRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function prefersReducedMotion() {
  return matchMedia("(prefers-reduced-motion: reduce)").matches
}

export function animate(
  element: Element,
  fps: number,
  draw: (seconds: number) => void,
  rootMargin = "0px",
) {
  draw(0)
  if (prefersReducedMotion()) return () => {}

  let frame = 0
  let last = 0
  const tick = (time: number) => {
    if (time - last > 1000 / fps) {
      last = time
      draw(time / 1000)
    }
    frame = requestAnimationFrame(tick)
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        cancelAnimationFrame(frame)
        if (entry.isIntersecting) frame = requestAnimationFrame(tick)
      }
    },
    { rootMargin },
  )
  observer.observe(element)

  return () => {
    observer.disconnect()
    cancelAnimationFrame(frame)
  }
}
