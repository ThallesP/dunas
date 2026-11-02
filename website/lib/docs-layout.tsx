import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared"
import { BrandMark } from "@/components/brand/brand-mark"
import { links } from "./links"

export const docsLayoutOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <BrandMark />
        <span className="font-semibold tracking-tight">dunas</span>
      </>
    ),
  },
  githubUrl: links.github,
  themeSwitch: { enabled: false },
}
