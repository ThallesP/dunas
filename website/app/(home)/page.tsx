import { Closing } from "./closing/closing"
import { Developers } from "./developers/developers"
import { Footer } from "./footer/footer"
import { OverscrollReveal } from "./footer/overscroll-reveal"
import { Hero } from "./hero/hero"
import { Posts } from "./posts/posts"
import { Routing } from "./routing/routing"

export default function HomePage() {
  return (
    <OverscrollReveal>
      <main>
        <Hero />
        <Posts />
        <Routing />
        <Developers />
        <Closing />
      </main>
      <Footer />
    </OverscrollReveal>
  )
}
