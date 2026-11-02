import type { Charge } from "../entities/charge.ts"

export type Serialized<T> = T extends Date
  ? string
  : T extends readonly (infer TItem)[]
    ? Serialized<TItem>[]
    : T extends object
      ? { [TKey in keyof T]: Serialized<T[TKey]> }
      : T

export type PixCharge = Serialized<Charge>

type BillingShape = {
  getCustomer(input: { customerId: string }): Promise<unknown>
  listPlans(input: { customerId: string }): Promise<unknown>
  subscribe(input: {
    customerId: string
    planId: string
    method?: string
    checkout?: string
    successUrl?: string
  }): Promise<unknown>
  cancel(input: { customerId: string; planId: string }): Promise<unknown>
  getCharge(input: { chargeId: string }): Promise<{ status: string }>
}

type Result<TMethod extends (...args: never[]) => Promise<unknown>> = Serialized<
  Awaited<ReturnType<TMethod>>
>

type PlanIdOf<TBilling extends BillingShape> = Parameters<TBilling["subscribe"]>[0]["planId"]

type SubscribeInputOf<TBilling extends BillingShape> = Omit<
  Parameters<TBilling["subscribe"]>[0],
  "customerId"
>

export type DunasClientOptions = {
  baseUrl?: string
  fetch?: typeof fetch
}

export class DunasClientError extends Error {
  readonly code: string
  readonly status: number

  constructor({ code, message, status }: { code: string; message: string; status: number }) {
    super(message)
    this.name = "DunasClientError"
    this.code = code
    this.status = status
  }
}

export function createDunasClient<TBilling extends BillingShape>({
  baseUrl = "/api/dunas",
  fetch: fetcher = globalThis.fetch,
}: DunasClientOptions = {}) {
  async function request<TResponse>(path: string, init?: { method: "POST"; body: unknown }) {
    const response = await fetcher(`${baseUrl}${path}`, {
      method: init?.method ?? "GET",
      headers: init ? { "content-type": "application/json" } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
      credentials: "include",
    })
    const body = await response.json()
    if (!response.ok) {
      throw new DunasClientError({ ...body.error, status: response.status })
    }
    return body as TResponse
  }

  function getCharge({ chargeId }: { chargeId: string }) {
    return request<Result<TBilling["getCharge"]>>(`/charges/${encodeURIComponent(chargeId)}`)
  }

  return {
    getCustomer: () => request<Result<TBilling["getCustomer"]>>("/customer"),
    listPlans: () => request<Result<TBilling["listPlans"]>>("/plans"),
    subscribe: (input: SubscribeInputOf<TBilling>) =>
      request<Result<TBilling["subscribe"]>>("/subscribe", { method: "POST", body: input }),
    cancel: ({ planId }: { planId: PlanIdOf<TBilling> }) =>
      request<Result<TBilling["cancel"]>>("/cancel", { method: "POST", body: { planId } }),
    getCharge,
    async waitForPayment({
      chargeId,
      intervalMs = 2_000,
      signal,
    }: {
      chargeId: string
      intervalMs?: number
      signal?: AbortSignal
    }) {
      while (true) {
        const charge = await getCharge({ chargeId })
        if (charge.status !== "pending" || signal?.aborted) {
          return charge
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      }
    },
  }
}
