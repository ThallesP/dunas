import {
  type DynamicModule,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common"
import { DiscoveryModule, DiscoveryService, HttpAdapterHost, MetadataScanner } from "@nestjs/core"
import type { Dunas } from "../billing/create-dunas.ts"
import type { DunasEvents, EventHandler } from "../billing/events.ts"
import type { Identify } from "../http/handler.ts"
import { toNodeHandler } from "../http/node.ts"
import { type NodeRequest, toRequestWithoutBody } from "../http/node-request.ts"

export type DunasModuleOptions = {
  billing: Pick<Dunas, "basePath" | "handler" | "on">
}

const EVENTS_KEY = Symbol("dunas:events")

export function OnDunasEvent<TEvent extends keyof DunasEvents>(type: TEvent) {
  return (
    target: object,
    key: string | symbol,
    _descriptor: TypedPropertyDescriptor<EventHandler<TEvent>>,
  ) => {
    const types: (keyof DunasEvents)[] = Reflect.getMetadata(EVENTS_KEY, target, key) ?? []
    Reflect.defineMetadata(EVENTS_KEY, [...types, type], target, key)
  }
}

export class DunasModule {
  static forRoot({ billing }: DunasModuleOptions): DynamicModule {
    return {
      module: DunasModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: Symbol("dunas:route"),
          inject: [HttpAdapterHost],
          useFactory: ({ httpAdapter }: HttpAdapterHost) =>
            httpAdapter.use(billing.basePath, toNodeHandler(billing.handler)),
        },
        {
          provide: Symbol("dunas:events"),
          inject: [DiscoveryService, MetadataScanner],
          useFactory: (discovery: DiscoveryService, scanner: MetadataScanner) => ({
            onModuleInit: () => {
              for (const wrapper of discovery.getProviders()) {
                if (!wrapper.instance || !wrapper.isDependencyTreeStatic()) {
                  continue
                }

                const prototype = Object.getPrototypeOf(wrapper.instance)
                for (const name of scanner.getAllMethodNames(prototype)) {
                  const types: (keyof DunasEvents)[] =
                    Reflect.getMetadata(EVENTS_KEY, prototype, name) ?? []
                  for (const type of types) {
                    billing.on(type, (payload) => wrapper.instance[name](payload))
                  }
                }
              }
            },
          }),
        },
      ],
    }
  }
}

type GuardBilling = {
  identify: Identify | undefined
  getCustomer(input: { customerId: string }): Promise<{ balances: object; flags: object }>
  check(input: { customerId: string; featureId: string; required?: number }): Promise<{
    allowed: boolean
  }>
  consume(input: { customerId: string; featureId: string; amount?: number }): Promise<{
    allowed: boolean
  }>
}

type CustomerOf<TBilling extends GuardBilling> = Awaited<ReturnType<TBilling["getCustomer"]>>
type MeteredIdOf<TBilling extends GuardBilling> = keyof CustomerOf<TBilling>["balances"] & string
type BooleanIdOf<TBilling extends GuardBilling> = keyof CustomerOf<TBilling>["flags"] & string

export function createDunasDecorators<TBilling extends GuardBilling>(billing: TBilling) {
  const { identify } = billing
  if (!identify) {
    throw new Error("createDunasDecorators needs identify in createDunas to find the customer")
  }

  const findCustomerId = async (context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<NodeRequest & { raw?: NodeRequest }>()
    const customer = await identify(toRequestWithoutBody(request.raw ?? request))
    if (!customer) {
      throw new UnauthorizedException({
        error: { code: "UNAUTHORIZED", message: "No customer for this request" },
      })
    }
    return customer.id
  }

  function RequireFeature(featureId: BooleanIdOf<TBilling>): MethodDecorator & ClassDecorator
  function RequireFeature(
    featureId: MeteredIdOf<TBilling>,
    options?: { required?: number },
  ): MethodDecorator & ClassDecorator
  function RequireFeature(featureId: string, { required }: { required?: number } = {}) {
    return UseGuards({
      canActivate: async (context: ExecutionContext) => {
        const customerId = await findCustomerId(context)
        const { allowed } = await billing.check({ customerId, featureId, required })
        if (!allowed) {
          throw new HttpException(
            {
              error: {
                code: "FEATURE_NOT_ALLOWED",
                message: `The plan does not include "${featureId}"`,
              },
            },
            HttpStatus.PAYMENT_REQUIRED,
          )
        }
        return true
      },
    })
  }

  function Consume(featureId: MeteredIdOf<TBilling>, { amount }: { amount?: number } = {}) {
    return UseGuards({
      canActivate: async (context: ExecutionContext) => {
        const customerId = await findCustomerId(context)
        const { allowed } = await billing.consume({ customerId, featureId, amount })
        if (!allowed) {
          throw new HttpException(
            {
              error: {
                code: "LIMIT_REACHED",
                message: `The plan limit for "${featureId}" is reached`,
              },
            },
            HttpStatus.PAYMENT_REQUIRED,
          )
        }
        return true
      },
    })
  }

  return { RequireFeature, Consume }
}
