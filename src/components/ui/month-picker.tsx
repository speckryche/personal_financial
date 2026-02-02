'use client'

import { useState } from 'react'
import { format, addMonths, subMonths } from 'date-fns'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface MonthPickerProps {
  value: Date
  onChange: (date: Date) => void
}

export function MonthPicker({ value, onChange }: MonthPickerProps) {
  const handlePrevMonth = () => {
    onChange(subMonths(value, 1))
  }

  const handleNextMonth = () => {
    onChange(addMonths(value, 1))
  }

  const handleCurrentMonth = () => {
    onChange(new Date())
  }

  const isCurrentMonth =
    value.getMonth() === new Date().getMonth() &&
    value.getFullYear() === new Date().getFullYear()

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handlePrevMonth}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2 min-w-[140px] justify-center">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{format(value, 'MMMM yyyy')}</span>
      </div>

      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8"
        onClick={handleNextMonth}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {!isCurrentMonth && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={handleCurrentMonth}
        >
          Today
        </Button>
      )}
    </div>
  )
}
