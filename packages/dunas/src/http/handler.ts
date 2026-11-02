import { getCharge, syncCharge } from "../billing/charges.ts"
import type { Context } from "../billing/context.ts"
import { type UpsertCustomerInput, upsertCustomer } from "../billing/customers.ts"
import { DunasError, type DunasErrorCode } from "../billing/errors.ts"
import { applyProviderEvents } from "../billing/provider-events.ts"
import { runRenewals } from "../billing/renewals.ts"
import { findProvider } from "../billing/routing.ts"
import { cancel, findPlan, subscribe } from "../billing/subscriptions.ts"
import { safeEqual } from "../lib/safe-equal.ts"
import { type Checkout, InvalidWebhookError, type PaymentMethod } from "../providers/provider.ts"

export type Identify = (
  request: Request,
) => Promise<UpsertCustomerInput | null> | UpsertCustomerInput | null

type HandlerOptions = {
  context: Context
  basePath: string
  identify: Identify | undefined
  cronSecret: string | undefined
  getCustomer: (input: { customerId: string }) => Promise<unknown>
  listPlans: (customerId: string) => Promise<unknown>
}

const errorStatus: Record<DunasErrorCode, number> = {
  PLAN_NOT_FOUND: 404,
  CHARGE_NOT_FOUND: 404,
  PROVIDER_NOT_FOUND: 404,
  INVALID_TAX_ID: 400,
  INVALID_PHONE: 400,
  ALL_PROVIDERS_FAILED: 502,
  SIMULATION_NOT_SUPPORTED: 400,
  FEATURE_NOT_METERED: 400,
  METHOD_NOT_AVAILABLE: 400,
}

const paymentMethods: readonly PaymentMethod[] = ["pix", "pix_automatico", "card"]

const checkouts: readonly Checkout[] = ["hosted", "embedded"]

export async function handleRequest(request: Request, options: HandlerOptions) {
  try {
    return await route(request, options)
  } catch (error) {
    if (error instanceof DunasError) {
      return json({ error: { code: error.code, message: error.message } }, errorStatus[error.code])
    }
    if (error instanceof InvalidWebhookError) {
      return json({ error: { code: "INVALID_WEBHOOK", message: error.message } }, 401)
    }
    console.error("[dunas] request failed", error)
    return json({ error: { code: "INTERNAL_ERROR", message: "Internal error" } }, 500)
  }
}

async function route(
  request: Request,
  { context, basePath, identify, cronSecret, getCustomer, listPlans }: HandlerOptions,
) {
  const url = new URL(request.url)
  const path = url.pathname.startsWith(basePath)
    ? url.pathname.slice(basePath.length)
    : url.pathname
  const [resource, id] = path.split("/").filter(Boolean)
  const routeKey = `${request.method} ${resource ?? ""}`

  if (routeKey === "POST webhooks" && id) {
    const provider = findProvider(context.providers, id)
    const events = await provider.parseWebhook({
      url,
      headers: request.headers,
      body: await request.text(),
    })
    await applyProviderEvents(context, provider, events)
    return json({ received: true })
  }

  if (resource === "renewals" && (request.method === "GET" || request.method === "POST")) {
    const authorization = request.headers.get("authorization") ?? ""
    if (!cronSecret || !safeEqual(authorization, `Bearer ${cronSecret}`)) {
      return json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, 401)
    }
    const { failures, ...result } = await runRenewals(context)
    return json({ ...result, failures: failures.length })
  }

  const customer = identify ? await identify(request) : null
  if (!customer) {
    return json({ error: { code: "UNAUTHORIZED", message: "No customer for this request" } }, 401)
  }
  await upsertCustomer(context, customer)

  if (routeKey === "GET customer") {
    return json(await getCustomer({ customerId: customer.id }))
  }

  if (routeKey === "GET plans") {
    return json(await listPlans(customer.id))
  }

  if (routeKey === "POST subscribe") {
    const { planId, method, checkout, successUrl } = await readBody(request)
    return json(
      await subscribe(context, {
        customerId: customer.id,
        planId: findPlan(context, planId).id,
        method,
        checkout,
        successUrl,
      }),
    )
  }

  if (routeKey === "POST cancel") {
    const { planId } = await readBody(request)
    return json(
      await cancel(context, { customerId: customer.id, planId: findPlan(context, planId).id }),
    )
  }

  if (routeKey === "GET charges" && id) {
    const charge = await getCharge(context, id)
    if (charge.customerId !== customer.id) {
      throw new DunasError("CHARGE_NOT_FOUND", `Charge "${id}" does not exist`)
    }
    const isStale = context.now().getTime() - charge.syncedAt.getTime() > 3_000
    return json(charge.status === "pending" && isStale ? await syncCharge(context, id) : charge)
  }

  return json(
    { error: { code: "NOT_FOUND", message: `No route for ${request.method} ${url.pathname}` } },
    404,
  )
}

async function readBody(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  const field = (key: string) =>
    typeof body === "object" && body !== null ? Reflect.get(body, key) : undefined

  const planId = field("planId")
  if (typeof planId !== "string") {
    throw new DunasError("PLAN_NOT_FOUND", "Request body must include a planId")
  }

  const method = paymentMethods.find((value) => value === field("method"))
  const checkout = checkouts.find((value) => value === field("checkout"))
  if (
    (field("method") !== undefined && !method) ||
    (field("checkout") !== undefined && !checkout)
  ) {
    throw new DunasError("METHOD_NOT_AVAILABLE", "Unknown payment method or checkout")
  }

  const successUrl = field("successUrl")
  return {
    planId,
    method,
    checkout,
    successUrl: typeof successUrl === "string" ? successUrl : undefined,
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}
