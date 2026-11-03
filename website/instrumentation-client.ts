import posthog from "posthog-js"

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: "/dunes",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    prepare_external_dependency_script: (script) => {
      script.src = script.src.replace("/posthog-recorder.js", "/sand.js")
      return script
    },
  })
}
