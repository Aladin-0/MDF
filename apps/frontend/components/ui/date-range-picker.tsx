"use client"

import * as React from "react"
import { addDays, format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface DatePickerWithRangeProps extends React.HTMLAttributes<HTMLDivElement> {
    date: DateRange | undefined;
    setDate: (date: DateRange | undefined) => void;
    buttonClassName?: string;
}

export function DatePickerWithRange({
  className,
  buttonClassName,
  date,
  setDate,
}: DatePickerWithRangeProps) {
  // One month on a phone (two side by side are ~600px wide), two from tablet up.
  const [months, setMonths] = React.useState(2)
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)")
    const apply = () => setMonths(mq.matches ? 2 : 1)
    apply()
    mq.addEventListener("change", apply)
    return () => mq.removeEventListener("change", apply)
  }, [])

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full sm:w-[260px] h-9 sm:h-8 justify-start text-left font-normal bg-white text-xs sm:text-sm border-slate-200 text-slate-700 hover:bg-slate-50",
              !date && "text-muted-foreground",
              buttonClassName
            )}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-500" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "LLL dd, y")} -{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              ) : (
                format(date.from, "LLL dd, y")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-[120]" align="start">
          <Calendar
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={months}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}

export const DateRangePicker = DatePickerWithRange;
