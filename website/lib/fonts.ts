import { Geist_Mono, Instrument_Sans } from "next/font/google"

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
})

export const fontVariables = `${instrumentSans.variable} ${geistMono.variable}`
