/**
 * String similarity utilities for QB account name matching
 */

/**
 * Calculate the Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  // Create matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance normalized by the longer string length
 */
export function calculateSimilarity(a: string, b: string): number {
  if (!a || !b) return 0
  if (a === b) return 1

  const normalizedA = a.toLowerCase().trim()
  const normalizedB = b.toLowerCase().trim()

  if (normalizedA === normalizedB) return 1

  const maxLength = Math.max(normalizedA.length, normalizedB.length)
  if (maxLength === 0) return 1

  const distance = levenshteinDistance(normalizedA, normalizedB)
  return 1 - distance / maxLength
}

/**
 * Normalize QB account name for comparison
 * - lowercase, trim
 * - collapse whitespace
 * - replace & with "and"
 * - remove parenthetical notes like (Exp), (2024)
 * - normalize common typos/abbreviations
 */
export function normalizeQBAccountName(name: string): string {
  if (!name) return ''

  let normalized = name
    // Lowercase and trim
    .toLowerCase()
    .trim()
    // Collapse multiple whitespace to single space
    .replace(/\s+/g, ' ')
    // Replace & with "and"
    .replace(/&/g, 'and')
    // Remove parenthetical notes like (Exp), (2024), (Other)
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Remove trailing/leading spaces after removals
    .trim()
    // Collapse whitespace again after removals
    .replace(/\s+/g, ' ')

  // Common abbreviation expansions
  const abbreviations: [RegExp, string][] = [
    [/\bexp\.?\b/gi, 'expenses'],
    [/\bent\.?\b/gi, 'entertainment'],
    [/\bsvc\.?\b/gi, 'service'],
    [/\bsvcs\.?\b/gi, 'services'],
    [/\bmgmt\.?\b/gi, 'management'],
    [/\badmin\.?\b/gi, 'administration'],
    [/\butil\.?\b/gi, 'utilities'],
    [/\bmaint\.?\b/gi, 'maintenance'],
    [/\binsur\.?\b/gi, 'insurance'],
  ]

  for (const [pattern, replacement] of abbreviations) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized
}

export interface SimilarAccount {
  name: string
  similarity: number
}

/**
 * Find similar account names from a list
 * @param target - The account name to find similarities for
 * @param candidates - List of candidate account names to compare against
 * @param threshold - Minimum similarity score (0-1), default 0.7
 * @returns Array of similar accounts sorted by similarity (highest first)
 */
export function findSimilarAccounts(
  target: string,
  candidates: string[],
  threshold: number = 0.7
): SimilarAccount[] {
  if (!target || !candidates.length) return []

  const normalizedTarget = normalizeQBAccountName(target)

  const results: SimilarAccount[] = []

  for (const candidate of candidates) {
    // Skip exact matches (case-insensitive)
    if (candidate.toLowerCase().trim() === target.toLowerCase().trim()) {
      continue
    }

    const normalizedCandidate = normalizeQBAccountName(candidate)

    // Check if normalized versions are identical (variation match)
    if (normalizedTarget === normalizedCandidate) {
      results.push({ name: candidate, similarity: 0.99 })
      continue
    }

    // Calculate similarity on normalized versions
    const similarity = calculateSimilarity(normalizedTarget, normalizedCandidate)

    if (similarity >= threshold) {
      results.push({ name: candidate, similarity })
    }
  }

  // Sort by similarity (highest first)
  return results.sort((a, b) => b.similarity - a.similarity)
}

/**
 * Group similar QB account names together
 * Returns groups where each group contains similar account names
 */
export function groupSimilarAccounts(
  accountNames: string[],
  threshold: number = 0.7
): string[][] {
  if (!accountNames.length) return []

  const used = new Set<string>()
  const groups: string[][] = []

  for (const name of accountNames) {
    if (used.has(name)) continue

    // Start a new group with this name
    const group = [name]
    used.add(name)

    // Find all similar names
    const similar = findSimilarAccounts(name, accountNames, threshold)
    for (const { name: similarName } of similar) {
      if (!used.has(similarName)) {
        group.push(similarName)
        used.add(similarName)
      }
    }

    groups.push(group)
  }

  return groups
}

/**
 * Check if two QB account names should be considered the same
 * (after normalization)
 */
export function areAccountNamesEquivalent(a: string, b: string): boolean {
  if (!a || !b) return false
  return normalizeQBAccountName(a) === normalizeQBAccountName(b)
}
