'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Save, AlertCircle } from 'lucide-react'

interface QBTransactionType {
  typeName: string
  count: number
  mappedType: 'income' | 'expense' | null
}

export function TransactionTypeMapping() {
  const supabase = createClient()
  const { toast } = useToast()

  const [transactionTypes, setTransactionTypes] = useState<QBTransactionType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pendingMappings, setPendingMappings] = useState<Record<string, 'income' | 'expense' | ''>>({})

  useEffect(() => {
    loadTransactionTypes()
  }, [])

  const loadTransactionTypes = async () => {
    setLoading(true)

    // Get all unique qb_transaction_type values and their counts
    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('qb_transaction_type')
      .not('qb_transaction_type', 'is', null)

    if (error) {
      toast({
        title: 'Error loading transaction types',
        description: error.message,
        variant: 'destructive',
      })
      setLoading(false)
      return
    }

    // Aggregate counts
    const typeCounts = new Map<string, number>()
    for (const t of transactions || []) {
      const typeName = t.qb_transaction_type?.trim()
      if (!typeName) continue
      typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1)
    }

    // Get existing mappings
    const { data: mappings } = await supabase
      .from('transaction_type_mappings')
      .select('qb_transaction_type, mapped_type')

    const mappingMap = new Map<string, 'income' | 'expense'>()
    for (const m of mappings || []) {
      mappingMap.set(m.qb_transaction_type, m.mapped_type as 'income' | 'expense')
    }

    // Build the list
    const types: QBTransactionType[] = Array.from(typeCounts.entries())
      .map(([typeName, count]) => ({
        typeName,
        count,
        mappedType: mappingMap.get(typeName) || null,
      }))
      .sort((a, b) => {
        // Unmapped first, then by count
        if (a.mappedType === null && b.mappedType !== null) return -1
        if (a.mappedType !== null && b.mappedType === null) return 1
        return b.count - a.count
      })

    setTransactionTypes(types)
    setLoading(false)
  }

  const handleMappingChange = (typeName: string, mappedType: string) => {
    setPendingMappings((prev) => ({
      ...prev,
      [typeName]: mappedType as 'income' | 'expense' | '',
    }))
  }

  const saveMappings = async () => {
    setSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      for (const [typeName, mappedType] of Object.entries(pendingMappings)) {
        if (mappedType === '') {
          // Delete mapping
          await supabase
            .from('transaction_type_mappings')
            .delete()
            .eq('user_id', user.id)
            .eq('qb_transaction_type', typeName)
        } else {
          // Upsert mapping
          const { error } = await supabase
            .from('transaction_type_mappings')
            .upsert(
              {
                user_id: user.id,
                qb_transaction_type: typeName,
                mapped_type: mappedType,
              },
              {
                onConflict: 'user_id,qb_transaction_type',
              }
            )

          if (error) throw error
        }
      }

      toast({
        title: 'Mappings saved',
        description: `Updated ${Object.keys(pendingMappings).length} mapping(s)`,
      })

      setPendingMappings({})
      await loadTransactionTypes()
    } catch (error) {
      toast({
        title: 'Error saving mappings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const getEffectiveMapping = (type: QBTransactionType): string => {
    if (pendingMappings[type.typeName] !== undefined) {
      return pendingMappings[type.typeName] || 'unmapped'
    }
    return type.mappedType || 'unmapped'
  }

  const unmappedCount = transactionTypes.filter((t) => {
    const effective = getEffectiveMapping(t)
    return effective === 'unmapped'
  }).length

  const hasPendingChanges = Object.keys(pendingMappings).length > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Map QuickBooks transaction types to Income or Expense. This determines how transactions
            are classified in your reports.
          </p>
          {unmappedCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-amber-600">
              <AlertCircle className="h-4 w-4" />
              {unmappedCount} unmapped transaction type{unmappedCount !== 1 && 's'}
            </div>
          )}
        </div>
        <Button onClick={saveMappings} disabled={saving || !hasPendingChanges}>
          {saving ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Mappings
        </Button>
      </div>

      {transactionTypes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No transaction types found. Import some transactions first.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>QB Transaction Type</TableHead>
              <TableHead className="text-right">Count</TableHead>
              <TableHead>Maps To</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactionTypes.map((type) => {
              const effectiveMapping = getEffectiveMapping(type)
              const isUnmapped = effectiveMapping === 'unmapped'

              return (
                <TableRow
                  key={type.typeName}
                  className={isUnmapped ? 'bg-amber-50/50 dark:bg-amber-950/20' : ''}
                >
                  <TableCell className="font-medium">{type.typeName}</TableCell>
                  <TableCell className="text-right">{type.count}</TableCell>
                  <TableCell>
                    <Select
                      value={effectiveMapping}
                      onValueChange={(value) => handleMappingChange(type.typeName, value === 'unmapped' ? '' : value)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unmapped">
                          <span className="text-muted-foreground">-- Unmapped --</span>
                        </SelectItem>
                        <SelectItem value="expense">
                          <Badge variant="destructive" className="font-normal">
                            Expense
                          </Badge>
                        </SelectItem>
                        <SelectItem value="income">
                          <Badge variant="default" className="font-normal">
                            Income
                          </Badge>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
