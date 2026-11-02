export function required(value: string | undefined, message: string) {
  if (!value) {
    throw new Error(message)
  }
  return value
}
