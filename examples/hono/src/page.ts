export const page = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>dunas demo</title>
  <style>
    body { font: 15px system-ui; max-width: 520px; margin: 48px auto; color: #111 }
    button { display: block; margin: 6px 0; font: inherit; padding: 8px 14px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer }
    pre { background: #f5f5f5; padding: 12px; border-radius: 8px; white-space: pre-wrap; word-break: break-all }
    img { width: 220px; display: block; margin: 12px 0 }
  </style>
</head>
<body>
  <h1>dunas demo</h1>
  <p id="usage">…</p>
  <p><button id="chat">Enviar mensagem</button></p>
  <div id="plans"></div>
  <div id="pix"></div>
  <pre id="log"></pre>
  <script type="module">
    const labels = {
      current: "Plano atual",
      resume: "Reativar",
      scheduled: "A partir do fim do período",
      pending_payment: "Pagar Pix pendente",
      subscribe: "Assinar",
      upgrade: "Fazer upgrade",
      downgrade: "Mudar para este",
    }
    const log = (value) => (document.querySelector("#log").textContent = JSON.stringify(value, null, 2))
    const api = (path, init) => fetch("/api/dunas" + path, init).then((response) => response.json())

    async function refresh() {
      const { balances } = await api("/customer")
      document.querySelector("#usage").textContent = "Mensagens: " + balances.messages.used + "/" + balances.messages.limit

      const plans = await api("/plans")
      document.querySelector("#plans").replaceChildren(
        ...plans.map(({ id, name, price, action }) => {
          const button = document.createElement("button")
          button.textContent = name + (price ? " · R$ " + (price.amountInCents / 100).toFixed(2) : "") + " · " + labels[action]
          button.disabled = action === "current" || action === "scheduled"
          button.onclick = () => subscribe(id)
          return button
        }),
      )
    }

    async function subscribe(planId) {
      const result = await api("/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId, method: "pix", checkout: "embedded" }),
      })
      log(result)
      const { next } = result
      if (next.type === "none") return refresh()

      document.querySelector("#pix").innerHTML =
        (next.qrCodeImageUrl ? '<img src="' + next.qrCodeImageUrl + '" />' : "") +
        "<pre>" + next.brCode + "</pre>" +
        '<button id="pay">Simular pagamento</button>'
      document.querySelector("#pay").onclick = () => fetch("/dev/pay/" + next.chargeId, { method: "POST" })

      while ((await api("/charges/" + next.chargeId)).status === "pending") {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
      document.querySelector("#pix").textContent = "Pago!"
      refresh()
    }

    document.querySelector("#chat").onclick = async () => {
      log(await fetch("/chat", { method: "POST" }).then((response) => response.json()))
      refresh()
    }

    refresh()
  </script>
</body>
</html>`
