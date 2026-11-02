import { Callout } from "fumadocs-ui/components/callout"
import { Step, Steps } from "fumadocs-ui/components/steps"
import { Tab, Tabs } from "fumadocs-ui/components/tabs"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import { Architecture } from "./docs/architecture"
import { EntryCards } from "./docs/entry-cards"
import { LogoTiles } from "./docs/logo-tiles"
import { SubscriptionLifecycle } from "./docs/subscription-lifecycle"

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Callout,
    Tab,
    Tabs,
    Step,
    Steps,
    Architecture,
    EntryCards,
    LogoTiles,
    SubscriptionLifecycle,
    ...components,
  } satisfies MDXComponents
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
