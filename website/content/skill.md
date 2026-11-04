---
name: dunas
description: Adiciona cobrança com a biblioteca dunas (planos, assinaturas e limites de uso sobre Woovi e AbacatePay) a um app Node com Postgres. Use quando o usuário pedir para cobrar, criar planos, assinaturas, limites de uso ou integrar Woovi ou AbacatePay.
---

# Cobrança com dunas

O dunas é uma biblioteca, não um serviço: roda dentro do app, guarda tudo no Postgres do próprio app e fala direto com a Woovi e a AbacatePay. Este arquivo tem o passo a passo e, no fim, a documentação inteira. Leia tudo antes de escrever código e não invente API que não esteja aqui.

## Passo a passo

1. **Olhe o projeto.** Descubra o gerenciador de pacotes, o framework HTTP (Next.js, Hono, NestJS, Express), como o app acessa o Postgres e como ele autentica usuários. Se já existir `billing/dunas.ts` ou `dunasjs` no `package.json`, continue de onde parou em vez de recomeçar.
2. **Pergunte os planos.** Antes de criar `billing/plans.ts`, pergunte ao usuário quais planos, preços e limites ele quer. Se ele não souber, proponha um plano grátis padrão e um pago e espere ele concordar.
3. **Instale** `dunasjs` e `pg` com o gerenciador de pacotes do projeto. Adicione ao `.env` só as variáveis do gateway que o usuário tem (Woovi, AbacatePay ou os dois) e um `CRON_SECRET` aleatório. Nunca escreva chaves reais em arquivos versionados; se faltar alguma, peça ao usuário.
4. **Declare os planos** em `billing/plans.ts` e **crie a instância** em `billing/dunas.ts`, como na página "Começar".
5. **Ligue `identify` à autenticação que já existe.** Com Better Auth, use `fromBetterAuth(auth)` de `dunasjs/better-auth`. O navegador nunca manda `customerId`.
6. **Crie as tabelas e monte a rota.** Rode `billing.migrate()` e monte `billing.handler` em `/api/dunas`, do jeito do framework do app.
7. **Proteja cada feature no servidor** com `billing.check` ou `billing.consume`.
8. **No navegador**, use `createDunasClient` de `dunasjs/client` para assinar. Comece pelo padrão: `subscribe({ planId })` e, se `next.type` for `"redirect"`, mande o cliente para `next.url`.
9. **Teste no sandbox** com `billing.simulatePayment` e confira com `billing.getCustomer` que a assinatura ficou `active`.
10. **Termine** dizendo ao usuário o que funciona, os arquivos que mudaram e o que falta antes de produção (chaves de produção, `registerWebhooks` com o servidor no ar, o cron de renovações). Depois pare.

## Regras

- Planos e features ficam só em `billing/plans.ts`. Não crie tabelas de plano nem guarde limites em outro lugar.
- Para saber se o cliente pode usar algo, chame `billing.check` ou `billing.consume` no servidor. No NestJS, use `@RequireFeature` e `@Consume` de `createDunasDecorators(billing)`. Não calcule acesso a partir de `subscriptions`.
- `consume` só registra se houver saldo. `track` registra sempre. Use `idempotencyKey` quando a requisição puder ser repetida.
- O navegador usa `dunasjs/client` e nunca envia `customerId`. Quem decide o cliente é `identify`.
- Valores são inteiros em centavos (`amountInCents`). O mínimo de um plano pago é 100.
- Webhooks precisam do corpo cru: no Express, monte o handler antes de `express.json()`; no NestJS, importe `DunasModule.forRoot({ billing })` de `dunasjs/nestjs` em vez de criar um controller.
- Não confie no payload do webhook nem no retorno do navegador para liberar acesso. O dunas relê a cobrança no gateway.
- Em testes, use `billing.simulatePayment` no sandbox ou `pglite` com um relógio falso (`now`).
- Comece sempre pelo caminho mais simples: `subscribe` sem `method` nem `checkout` (página do provedor, com Pix Automático quando houver). Só use `checkout: "embedded"` se o usuário quiser o QR code dentro do app, e só ligue `methods` (`"pix_automatico"`, `"card"`) que a conta dele tem habilitados.
- Cartão existe só pela AbacatePay, na página dela. O dunas ainda não tem boleto, períodos de teste, proração nem reembolsos. Não prometa nem implemente isso por fora.

Se o repositório tiver `AGENTS.md` ou `CLAUDE.md`, ofereça ao usuário colar estas regras numa seção "Cobrança (dunas)".

# Documentação
