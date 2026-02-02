'use client'

import { useState, useMemo } from 'react'
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  subYears,
} from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar, ChevronDown } from 'lucide-react'

export interface DateRange {
  start: Date
  end: Date
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  yearsBack?: number
}

type PresetKey = 'thisMonth' | 'lastMonth' | 'last3Months' | 'last6Months' | 'ytd' | 'lastYear'

interface Preset {
  label: string
  getRange: () => DateRange
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export function DateRangePicker({ value, onChange, yearsBack = 5 }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth()

  // Generate year options (current year back to yearsBack years ago)
  const years = useMemo(() => {
    const result: number[] = []
    for (let y = currentYear; y >= currentYear - yearsBack; y--) {
      result.push(y)
    }
    return result
  }, [currentYear, yearsBack])

  // Presets
  const presets: Record<PresetKey, Preset> = {
    thisMonth: {
      label: 'This Month',
      getRange: () => ({
        start: startOfMonth(now),
        end: endOfMonth(now),
      }),
    },
    lastMonth: {
      label: 'Last Month',
      getRange: () => ({
        start: startOfMonth(subMonths(now, 1)),
        end: endOfMonth(subMonths(now, 1)),
      }),
    },
    last3Months: {
      label: 'Last 3 Months',
      getRange: () => ({
        start: startOfMonth(subMonths(now, 2)),
        end: endOfMonth(now),
      }),
    },
    last6Months: {
      label: 'Last 6 Months',
      getRange: () => ({
        start: startOfMonth(subMonths(now, 5)),
        end: endOfMonth(now),
      }),
    },
    ytd: {
      label: 'Year to Date',
      getRange: () => ({
        start: startOfYear(now),
        end: endOfMonth(now),
      }),
    },
    lastYear: {
      label: 'Last Year',
      getRange: () => ({
        start: startOfYear(subYears(now, 1)),
        end: endOfMonth(subYears(now, 1).getFullYear() === currentYear - 1
          ? new Date(currentYear - 1, 11, 31)
          : subYears(now, 1)),
      }),
    },
  }

  // Fix lastYear preset to get full previous year
  presets.lastYear.getRange = () => ({
    start: new Date(currentYear - 1, 0, 1),
    end: new Date(currentYear - 1, 11, 31),
  })

  const handlePreset = (key: PresetKey) => {
    onChange(presets[key].getRange())
    setOpen(false)
  }

  const handleStartMonthChange = (monthStr: string) => {
    const month = parseInt(monthStr, 10)
    const newStart = new Date(value.start.getFullYear(), month, 1)
    // Ensure start doesn't go after end
    if (newStart > value.end) {
      onChange({
        start: startOfMonth(newStart),
        end: endOfMonth(newStart),
      })
    } else {
      onChange({
        ...value,
        start: startOfMonth(newStart),
      })
    }
  }

  const handleStartYearChange = (yearStr: string) => {
    const year = parseInt(yearStr, 10)
    const newStart = new Date(year, value.start.getMonth(), 1)
    // Ensure start doesn't go after end
    if (newStart > value.end) {
      onChange({
        start: startOfMonth(newStart),
        end: endOfMonth(newStart),
      })
    } else {
      onChange({
        ...value,
        start: startOfMonth(newStart),
      })
    }
  }

  const handleEndMonthChange = (monthStr: string) => {
    const month = parseInt(monthStr, 10)
    const newEnd = new Date(value.end.getFullYear(), month, 1)
    // Ensure end doesn't go before start
    if (newEnd < value.start) {
      onChange({
        start: startOfMonth(newEnd),
        end: endOfMonth(newEnd),
      })
    } else {
      onChange({
        ...value,
        end: endOfMonth(newEnd),
      })
    }
  }

  const handleEndYearChange = (yearStr: string) => {
    const year = parseInt(yearStr, 10)
    const newEnd = new Date(year, value.end.getMonth(), 1)
    // Ensure end doesn't go before start
    if (newEnd < value.start) {
      onChange({
        start: startOfMonth(newEnd),
        end: endOfMonth(newEnd),
      })
    } else {
      onChange({
        ...value,
        end: endOfMonth(newEnd),
      })
    }
  }

  // Format display label
  const getDisplayLabel = () => {
    const startStr = format(value.start, 'MMM yyyy')
    const endStr = format(value.end, 'MMM yyyy')
    if (startStr === endStr) {
      return startStr
    }
    return `${startStr} - ${endStr}`
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[200px] justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{getDisplayLabel()}</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-4">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(presets) as PresetKey[]).map((key) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handlePreset(key)}
              >
                {presets[key].label}
              </Button>
            ))}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-3">Custom Range</p>

            {/* Start Date */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm text-muted-foreground w-12">From:</span>
              <Select
                value={value.start.getMonth().toString()}
                onValueChange={handleStartMonthChange}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={value.start.getFullYear().toString()}
                onValueChange={handleStartYearChange}
              >
                <SelectTrigger className="w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* End Date */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-12">To:</span>
              <Select
                value={value.end.getMonth().toString()}
                onValueChange={handleEndMonthChange}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={idx.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={value.end.getFullYear().toString()}
                onValueChange={handleEndYearChange}
              >
                <SelectTrigger className="w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
