"use client"

import { type ReactNode, useState } from "react"
import { CheckIcon } from "@/components/icons/check-icon"
import { CopyIcon } from "@/components/icons/copy-icon"

export type CopyButtonProps = {
  text: string
  iconSize: number
  className?: string
  iconClassName?: string
  children: ReactNode
}

export function CopyButton({
  text,
  iconSize,
  className,
  iconClassName,
  children,
}: CopyButtonProps) {
  const [isCopied, setIsCopied] = useState(false)

  async function handleCopy() {
    await navigator.clipboard.writeText(text)
    setIsCopied(true)
    setTimeout(() => setIsCopied(false), 1_500)
  }

  return (
    <button
      type="button"
      className={className}
      onClick={handleCopy}
      aria-label={isCopied ? "Copiado" : `Copiar "${text}"`}
    >
      {children}
      <span className={iconClassName}>
        {isCopied ? <CheckIcon size={iconSize} /> : <CopyIcon size={iconSize} />}
      </span>
    </button>
  )
}
