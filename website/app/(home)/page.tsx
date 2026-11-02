import { Closing } from "./closing/closing"
import { Details } from "./details/details"
import { Footer } from "./footer/footer"
import { OverscrollReveal } from "./footer/overscroll-reveal"
import { Hero } from "./hero/hero"
import { Steps } from "./steps/steps"
import { Usage } from "./usage/usage"

export default function HomePage() {
  return (
    <OverscrollReveal>
      <main>
        <Hero />
        <Usage />
        <Steps />
        <Details />
        <Closing />
      </main>
      <Footer />
    </OverscrollReveal>
  )
}
