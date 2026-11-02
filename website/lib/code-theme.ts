import type { ThemeRegistration } from "shiki"

export const codeTheme: ThemeRegistration = {
  name: "dunas",
  type: "dark",
  colors: {
    "editor.background": "#00000000",
    "editor.foreground": "#C3CADA",
  },
  tokenColors: [
    {
      scope: ["keyword", "storage", "variable.language.this"],
      settings: { foreground: "#8FA3CC" },
    },
    {
      scope: ["string", "punctuation.definition.string"],
      settings: { foreground: "#E3E8F2" },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.decorator"],
      settings: { foreground: "#F4EFE6" },
    },
    {
      scope: ["constant.numeric", "constant.language"],
      settings: { foreground: "#AEBBD6" },
    },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#4E5770" },
    },
  ],
}
