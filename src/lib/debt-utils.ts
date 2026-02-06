import type { AccountWithBalance } from '@/lib/account-balance'

export interface DebtAccount extends AccountWithBalance {
  interest_rate: number | null
  minimum_payment: number | null
  target_payoff_date: string | null
  payoff_priority: number | null
}

export type PayoffStrategy = 'avalanche' | 'snowball' | 'manual'

/**
 * Calculate the projected payoff date based on balance, APR, and monthly payment.
 * Uses amortization formula to account for compound interest.
 * Returns null if the payment doesn't cover the monthly interest (debt will never be paid off).
 */
export function calculatePayoffDate(
  balance: number,
  apr: number,
  monthlyPayment: number
): Date | null {
  if (balance <= 0) return new Date()
  if (monthlyPayment <= 0) return null

  const monthlyRate = apr / 100 / 12

  // If no interest, simple division
  if (monthlyRate === 0) {
    const months = Math.ceil(balance / monthlyPayment)
    const payoffDate = new Date()
    payoffDate.setMonth(payoffDate.getMonth() + months)
    return payoffDate
  }

  // Check if payment covers monthly interest
  const monthlyInterest = balance * monthlyRate
  if (monthlyPayment <= monthlyInterest) {
    return null // Payment doesn't cover interest - debt will never be paid off
  }

  // Calculate number of months to payoff using amortization formula
  // n = -log(1 - (r * PV) / PMT) / log(1 + r)
  const months = Math.ceil(
    -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate)
  )

  const payoffDate = new Date()
  payoffDate.setMonth(payoffDate.getMonth() + months)
  return payoffDate
}

/**
 * Calculate the number of months until payoff.
 * Returns null if the debt can't be paid off with current payment.
 */
export function calculateMonthsToPayoff(
  balance: number,
  apr: number,
  monthlyPayment: number
): number | null {
  if (balance <= 0) return 0
  if (monthlyPayment <= 0) return null

  const monthlyRate = apr / 100 / 12

  if (monthlyRate === 0) {
    return Math.ceil(balance / monthlyPayment)
  }

  const monthlyInterest = balance * monthlyRate
  if (monthlyPayment <= monthlyInterest) {
    return null
  }

  return Math.ceil(
    -Math.log(1 - (monthlyRate * balance) / monthlyPayment) / Math.log(1 + monthlyRate)
  )
}

/**
 * Calculate the weighted average APR across all debts.
 * Weighted by the balance of each debt.
 */
export function calculateWeightedAPR(debts: DebtAccount[]): number {
  const debtsWithRate = debts.filter(d => d.interest_rate != null && d.interest_rate > 0)

  if (debtsWithRate.length === 0) return 0

  const totalBalance = debtsWithRate.reduce((sum, d) => sum + Math.abs(d.display_balance), 0)
  if (totalBalance === 0) return 0

  const weightedSum = debtsWithRate.reduce(
    (sum, d) => sum + (d.interest_rate! * Math.abs(d.display_balance)),
    0
  )

  return weightedSum / totalBalance
}

/**
 * Sort debts by payoff strategy.
 * - avalanche: Highest interest rate first (mathematically optimal)
 * - snowball: Lowest balance first (psychologically motivating)
 * - manual: Use payoff_priority field (user-defined order)
 */
export function sortByPayoffStrategy(
  debts: DebtAccount[],
  strategy: PayoffStrategy = 'avalanche'
): DebtAccount[] {
  const sorted = [...debts]

  switch (strategy) {
    case 'avalanche':
      // Highest interest rate first, then by balance (highest first) as tiebreaker
      return sorted.sort((a, b) => {
        const rateA = a.interest_rate ?? 0
        const rateB = b.interest_rate ?? 0
        if (rateB !== rateA) return rateB - rateA
        return Math.abs(b.display_balance) - Math.abs(a.display_balance)
      })

    case 'snowball':
      // Lowest balance first
      return sorted.sort((a, b) =>
        Math.abs(a.display_balance) - Math.abs(b.display_balance)
      )

    case 'manual':
      // Use payoff_priority (lower = pay first), debts without priority go last
      return sorted.sort((a, b) => {
        const priorityA = a.payoff_priority ?? Number.MAX_SAFE_INTEGER
        const priorityB = b.payoff_priority ?? Number.MAX_SAFE_INTEGER
        if (priorityA !== priorityB) return priorityA - priorityB
        // Fall back to avalanche for debts with same priority
        const rateA = a.interest_rate ?? 0
        const rateB = b.interest_rate ?? 0
        return rateB - rateA
      })

    default:
      return sorted
  }
}

/**
 * Calculate the monthly interest accrued on a balance.
 */
export function calculateMonthlyInterest(balance: number, apr: number): number {
  if (balance <= 0 || apr <= 0) return 0
  return Math.abs(balance) * (apr / 100 / 12)
}

/**
 * Calculate total minimum monthly payments across all debts.
 */
export function calculateTotalMinimumPayments(debts: DebtAccount[]): number {
  return debts.reduce((sum, d) => sum + (d.minimum_payment ?? 0), 0)
}

/**
 * Calculate total interest paid per month across all debts.
 */
export function calculateTotalMonthlyInterest(debts: DebtAccount[]): number {
  return debts.reduce((sum, d) => {
    const rate = d.interest_rate ?? 0
    return sum + calculateMonthlyInterest(d.display_balance, rate)
  }, 0)
}

/**
 * Determine the effective payoff strategy based on debts.
 * If any debt has a manual priority set, use manual. Otherwise default to avalanche.
 */
export function getEffectiveStrategy(debts: DebtAccount[]): PayoffStrategy {
  const hasManualPriority = debts.some(d => d.payoff_priority != null)
  return hasManualPriority ? 'manual' : 'avalanche'
}

/**
 * Format months to a human-readable string.
 */
export function formatMonthsToPayoff(months: number | null): string {
  if (months === null) return 'Never'
  if (months === 0) return 'Paid off'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`

  const years = Math.floor(months / 12)
  const remainingMonths = months % 12

  if (remainingMonths === 0) {
    return `${years} year${years === 1 ? '' : 's'}`
  }

  return `${years}y ${remainingMonths}m`
}
