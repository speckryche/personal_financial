import type { Category } from '@/types/database'

export interface CategoryWithChildren extends Category {
  children: Category[]
}

/**
 * Build a hierarchical tree from a flat list of categories
 * Parents at root level with their children nested
 */
export function buildCategoryTree(categories: Category[]): CategoryWithChildren[] {
  const parentMap = new Map<string, CategoryWithChildren>()
  const orphans: CategoryWithChildren[] = []

  // First pass: create CategoryWithChildren for all categories
  for (const cat of categories) {
    if (cat.parent_id === null) {
      parentMap.set(cat.id, { ...cat, children: [] })
    }
  }

  // Second pass: assign children to parents, collect orphans
  for (const cat of categories) {
    if (cat.parent_id !== null) {
      const parent = parentMap.get(cat.parent_id)
      if (parent) {
        parent.children.push(cat)
      } else {
        // Orphan: parent_id is set but parent doesn't exist
        orphans.push({ ...cat, children: [] })
      }
    }
  }

  // Sort children within each parent
  Array.from(parentMap.values()).forEach((parent) => {
    parent.children.sort((a, b) => a.name.localeCompare(b.name))
  })

  // Combine parents and orphans, sorted alphabetically
  const result = [...Array.from(parentMap.values()), ...orphans]
  result.sort((a: CategoryWithChildren, b: CategoryWithChildren) => a.name.localeCompare(b.name))

  return result
}

/**
 * Get parent categories only (parent_id === null)
 */
export function getParentCategories(categories: Category[]): Category[] {
  return categories
    .filter((c) => c.parent_id === null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get subcategories only (parent_id !== null)
 */
export function getSubcategories(categories: Category[]): Category[] {
  return categories
    .filter((c) => c.parent_id !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Get subcategories grouped by their parent for dropdown display
 * Returns structure suitable for grouped select menus
 */
export interface CategoryGroup {
  parent: Category
  subcategories: Category[]
}

export function getCategoriesGroupedByParent(categories: Category[]): CategoryGroup[] {
  const tree = buildCategoryTree(categories)

  return tree
    .filter((parent) => parent.children.length > 0)
    .map((parent) => ({
      parent: {
        id: parent.id,
        user_id: parent.user_id,
        name: parent.name,
        type: parent.type,
        parent_id: parent.parent_id,
        qb_category_names: parent.qb_category_names,
        color: parent.color,
        created_at: parent.created_at,
        updated_at: parent.updated_at,
      },
      subcategories: parent.children,
    }))
}

/**
 * Get all subcategories (for QB mapping dropdowns)
 * Groups them by parent for better UX
 */
export function getSubcategoriesForMapping(
  categories: Category[],
  type?: 'income' | 'expense' | 'transfer'
): CategoryGroup[] {
  const filtered = type ? categories.filter((c) => c.type === type) : categories
  return getCategoriesGroupedByParent(filtered)
}

/**
 * Check if a category is a parent (has children)
 */
export function isParentCategory(category: Category, allCategories: Category[]): boolean {
  return allCategories.some((c) => c.parent_id === category.id)
}

/**
 * Get children count for a category
 */
export function getChildrenCount(categoryId: string, allCategories: Category[]): number {
  return allCategories.filter((c) => c.parent_id === categoryId).length
}

/**
 * Count orphan categories (categories without a parent that should have one)
 * This helps identify categories that need to be assigned to parents
 */
export function getOrphanCategories(categories: Category[]): Category[] {
  // For now, we consider all top-level categories (parent_id === null) as potential "orphans"
  // that could be assigned as subcategories. The user decides.
  // This is mainly for backward compatibility display
  return getParentCategories(categories)
}

/**
 * Aggregate transactions by parent category for Tier 1 (Summary) view
 * Takes transactions with category info and aggregates to parent level
 */
export interface AggregatedCategory {
  id: string
  name: string
  color: string | null
  total: number
  isParent: boolean
}

export function aggregateByParentCategory(
  transactions: Array<{
    amount: number
    category?: {
      id: string
      name: string
      color: string | null
      parent_id: string | null
      parent?: { id: string; name: string; color: string | null } | null
    } | null
  }>,
  categories: Category[]
): AggregatedCategory[] {
  const totals = new Map<string, { name: string; color: string | null; total: number; isParent: boolean }>()

  for (const t of transactions) {
    const cat = t.category
    if (!cat) {
      // Uncategorized
      const existing = totals.get('uncategorized')
      if (existing) {
        existing.total += Math.abs(t.amount)
      } else {
        totals.set('uncategorized', {
          name: 'Uncategorized',
          color: '#6b7280',
          total: Math.abs(t.amount),
          isParent: false,
        })
      }
      continue
    }

    // If category has a parent, aggregate to parent level
    if (cat.parent_id && cat.parent) {
      const key = cat.parent.id
      const existing = totals.get(key)
      if (existing) {
        existing.total += Math.abs(t.amount)
      } else {
        totals.set(key, {
          name: cat.parent.name,
          color: cat.parent.color,
          total: Math.abs(t.amount),
          isParent: true,
        })
      }
    } else {
      // Category is either a parent itself or an orphan - use as-is
      const key = cat.id
      const existing = totals.get(key)
      const hasChildren = categories.some((c) => c.parent_id === cat.id)
      if (existing) {
        existing.total += Math.abs(t.amount)
      } else {
        totals.set(key, {
          name: cat.name,
          color: cat.color,
          total: Math.abs(t.amount),
          isParent: hasChildren,
        })
      }
    }
  }

  return Array.from(totals.entries())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total)
}

/**
 * Aggregate transactions by subcategory for Tier 2 (Detailed) view
 * Uses the direct category on each transaction
 */
export function aggregateBySubcategory(
  transactions: Array<{
    amount: number
    category?: {
      id: string
      name: string
      color: string | null
      parent_id: string | null
    } | null
  }>
): AggregatedCategory[] {
  const totals = new Map<string, { name: string; color: string | null; total: number }>()

  for (const t of transactions) {
    const cat = t.category
    if (!cat) {
      const existing = totals.get('uncategorized')
      if (existing) {
        existing.total += Math.abs(t.amount)
      } else {
        totals.set('uncategorized', {
          name: 'Uncategorized',
          color: '#6b7280',
          total: Math.abs(t.amount),
        })
      }
      continue
    }

    const key = cat.id
    const existing = totals.get(key)
    if (existing) {
      existing.total += Math.abs(t.amount)
    } else {
      totals.set(key, {
        name: cat.name,
        color: cat.color,
        total: Math.abs(t.amount),
      })
    }
  }

  return Array.from(totals.entries())
    .map(([id, data]) => ({ id, ...data, isParent: false }))
    .sort((a, b) => b.total - a.total)
}
