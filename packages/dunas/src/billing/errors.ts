export type DunasErrorCode =
  | "PLAN_NOT_FOUND"
  | "CHARGE_NOT_FOUND"
  | "PROVIDER_NOT_FOUND"
  | "INVALID_TAX_ID"
  | "INVALID_PHONE"
  | "ALL_PROVIDERS_FAILED"
  | "SIMULATION_NOT_SUPPORTED"
  | "FEATURE_NOT_METERED"
  | "METHOD_NOT_AVAILABLE"

export class DunasError extends Error {
  readonly code: DunasErrorCode

  constructor(code: DunasErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "DunasError"
    this.code = code
  }
}
