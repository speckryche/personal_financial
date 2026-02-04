'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrencyDetailed } from '@/lib/utils'
import type { ParsedInvestment } from '@/lib/parsers/quickbooks/investment-parser'

interface ImportPreviewProps {
  type: 'investments'
  data: ParsedInvestment[]
  limit?: number
}

export function ImportPreview(props: ImportPreviewProps) {
  const limit = props.limit || 10
  const investments = props.data.slice(0, limit)

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Cost Basis</TableHead>
            <TableHead className="text-right">Current Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {investments.map((inv, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{inv.symbol}</TableCell>
              <TableCell className="max-w-[200px] truncate">
                {inv.name || '-'}
              </TableCell>
              <TableCell className="text-right">
                {inv.quantity.toLocaleString()}
              </TableCell>
              <TableCell className="text-right">
                {inv.cost_basis ? formatCurrencyDetailed(inv.cost_basis) : '-'}
              </TableCell>
              <TableCell className="text-right">
                {inv.current_value ? formatCurrencyDetailed(inv.current_value) : '-'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {props.data.length > limit && (
        <div className="border-t p-3 text-center text-sm text-muted-foreground">
          Showing {limit} of {props.data.length} holdings
        </div>
      )}
    </div>
  )
}
