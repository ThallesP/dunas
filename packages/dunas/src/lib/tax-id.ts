export function normalizeTaxId(taxId: string) {
  const digits = taxId.replace(/\D/g, "")

  if (digits.length === 11 && isValidCpf(digits)) {
    return digits
  }

  if (digits.length === 14 && isValidCnpj(digits)) {
    return digits
  }

  return null
}

function isValidCpf(cpf: string) {
  if (/^(\d)\1{10}$/.test(cpf)) {
    return false
  }

  const digits = [...cpf].map(Number)
  const checkDigit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .reduce((total, digit, index) => total + digit * (length + 1 - index), 0)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }

  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10]
}

function isValidCnpj(cnpj: string) {
  if (/^(\d)\1{13}$/.test(cnpj)) {
    return false
  }

  const digits = [...cnpj].map(Number)
  const checkDigit = (length: number) => {
    const weights =
      length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const sum = weights.reduce((total, weight, index) => total + weight * (digits[index] ?? 0), 0)
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }

  return checkDigit(12) === digits[12] && checkDigit(13) === digits[13]
}
