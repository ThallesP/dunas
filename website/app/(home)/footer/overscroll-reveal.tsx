"use client"

import Image from "next/image"
import { type ReactNode, useEffect, useRef } from "react"
import { prefersReducedMotion } from "@/lib/dither"
import { Overscroll } from "./overscroll"
import styles from "./overscroll-reveal.module.css"

function isScrolledToBottom() {
  const root = document.documentElement
  return root.scrollTop + root.clientHeight >= root.scrollHeight - 1
}

function revealLimit() {
  return window.innerHeight * 0.48
}

export type OverscrollRevealProps = {
  children: ReactNode
}

export function OverscrollReveal({ children }: OverscrollRevealProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sheet = sheetRef.current
    const art = artRef.current
    if (!sheet || !art || prefersReducedMotion()) return

    const overscroll = new Overscroll(revealLimit())
    let frame = 0
    let lastFrameAt = 0
    let touchY = 0
    let isTouchMomentum = false
    let scrollTop = 0
    let scrollAt = 0

    const tick = (time: number) => {
      overscroll.step(Math.min(0.032, Math.max(0, time - lastFrameAt) / 1000))
      lastFrameAt = time
      if (overscroll.isResting) {
        frame = 0
        sheet.style.transform = ""
        sheet.style.willChange = ""
        art.style.visibility = ""
        return
      }

      sheet.style.transform = `translate3d(0, ${-overscroll.offset}px, 0)`
      frame = requestAnimationFrame(tick)
    }

    const play = () => {
      if (frame || overscroll.isResting) return

      art.style.visibility = "visible"
      sheet.style.willChange = "transform"
      lastFrameAt = performance.now()
      frame = requestAnimationFrame(tick)
    }

    const handleWheel = (event: WheelEvent) => {
      isTouchMomentum = false
      const lineInPx = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 1 : 16
      const delta = event.deltaY * lineInPx
      overscroll.wheel(delta, event.timeStamp, isScrolledToBottom())
      play()
    }

    const handleTouchStart = (event: TouchEvent) => {
      const [touch] = event.touches
      if (!touch) return

      touchY = touch.clientY
    }

    const handleTouchMove = (event: TouchEvent) => {
      const [touch] = event.touches
      if (!touch) return

      const distance = touchY - touch.clientY
      touchY = touch.clientY
      if (distance < 0) {
        overscroll.release()
        return
      }
      if (!isScrolledToBottom()) return

      overscroll.hold()
      overscroll.drag(distance)
      play()
    }

    const handleTouchEnd = () => {
      isTouchMomentum = true
      overscroll.release()
      play()
    }

    const handleScroll = (event: Event) => {
      const top = document.documentElement.scrollTop
      const speed = (top - scrollTop) / Math.max(1, event.timeStamp - scrollAt)
      scrollTop = top
      scrollAt = event.timeStamp
      if (!isTouchMomentum || !isScrolledToBottom()) return

      isTouchMomentum = false
      overscroll.fling(speed)
      play()
    }

    const handleOtherInput = () => {
      isTouchMomentum = false
    }

    const handleResize = () => {
      overscroll.limit = revealLimit()
    }

    const passive = { passive: true }
    window.addEventListener("wheel", handleWheel, passive)
    window.addEventListener("touchstart", handleTouchStart, passive)
    window.addEventListener("touchmove", handleTouchMove, passive)
    window.addEventListener("touchend", handleTouchEnd, passive)
    window.addEventListener("touchcancel", handleTouchEnd, passive)
    window.addEventListener("scroll", handleScroll, passive)
    window.addEventListener("keydown", handleOtherInput, passive)
    window.addEventListener("pointerdown", handleOtherInput, passive)
    window.addEventListener("resize", handleResize, passive)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("wheel", handleWheel)
      window.removeEventListener("touchstart", handleTouchStart)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleTouchEnd)
      window.removeEventListener("touchcancel", handleTouchEnd)
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("keydown", handleOtherInput)
      window.removeEventListener("pointerdown", handleOtherInput)
      window.removeEventListener("resize", handleResize)
      sheet.style.transform = ""
      sheet.style.willChange = ""
      art.style.visibility = ""
    }
  }, [])

  return (
    <>
      <div ref={sheetRef} className={styles.sheet}>
        {children}
      </div>
      <div ref={artRef} className={styles.art}>
        <Image
          className={styles.dunes}
          src="/art/dunes-dawn.png"
          alt="Dunas dos Lençóis Maranhenses ao amanhecer, em pontilhado"
          width={480}
          height={224}
        />
      </div>
    </>
  )
}
