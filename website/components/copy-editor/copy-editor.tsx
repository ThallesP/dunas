"use client"

import { useEffect, useState } from "react"
import styles from "./copy-editor.module.css"

// Temporary dev-only tool: makes every title and text block editable in place and saves
// edits to website/copy-edits.json as { "original text": "new text" }. Remove once applied.
const titleSelector =
  'main h1, main h2, main h3, main h4, main p, main [class*="itemTitle"], main [class*="itemText"]'

// Elements holding icons or images would lose them when their text is replaced.
function isPlainText(element: HTMLElement) {
  return [...element.children].every((child) => child.tagName === "BR")
}

type Edits = Record<string, string>

async function saveEdit(original: string, text: string): Promise<Edits> {
  const response = await fetch("/api/copy-edits", {
    method: "POST",
    body: JSON.stringify({ original, text }),
  })
  return response.json()
}

export function CopyEditor() {
  const [edits, setEdits] = useState<Edits>({})

  useEffect(() => {
    const editableClass = styles.editable
    if (!editableClass) return

    const titles = [...document.querySelectorAll<HTMLElement>(titleSelector)].filter(isPlainText)
    const originals = new Map(titles.map((title) => [title, title.innerText]))

    function handleBlur(event: FocusEvent) {
      const title = event.currentTarget as HTMLElement
      const original = originals.get(title) ?? ""
      saveEdit(original, title.innerText.trim()).then(setEdits)
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.shiftKey) return
      event.preventDefault()
      ;(event.currentTarget as HTMLElement).blur()
    }

    for (const title of titles) {
      title.contentEditable = "plaintext-only"
      title.spellcheck = false
      title.classList.add(editableClass)
      title.addEventListener("blur", handleBlur)
      title.addEventListener("keydown", handleKeyDown)
    }

    fetch("/api/copy-edits")
      .then((response) => response.json())
      .then((saved: Edits) => {
        setEdits(saved)
        for (const [title, original] of originals) {
          if (saved[original]) title.innerText = saved[original]
        }
      })

    return () => {
      for (const [title, original] of originals) {
        title.contentEditable = "false"
        title.classList.remove(editableClass)
        title.removeEventListener("blur", handleBlur)
        title.removeEventListener("keydown", handleKeyDown)
        title.innerText = original
      }
    }
  }, [])

  const editCount = Object.keys(edits).length

  return (
    <div className={styles.badge}>
      {editCount === 1 ? "1 texto editado" : `${editCount} textos editados`}
    </div>
  )
}
