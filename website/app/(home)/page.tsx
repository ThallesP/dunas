import { Closing } from "./closing/closing"
import { Developers } from "./developers/developers"
import { Footer } from "./footer/footer"
import { OverscrollReveal } from "./footer/overscroll-reveal"
import { Hero } from "./hero/hero"
import { Posts } from "./posts/posts"

export default function HomePage() {
  return (
    <OverscrollReveal>
      <main>
        <Hero />
        <Posts />
        <Developers />
        <Closing />
      </main>
      <Footer />
    </OverscrollReveal>
  )
}
