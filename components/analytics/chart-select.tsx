"use client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@aisocratic/design/components/select";

export function ChartSelect({ label, value, onValueChange, options }: { label: string; value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <Select value={value} onValueChange={onValueChange}><SelectTrigger aria-label={label} size="sm" className="analytics-select"><SelectValue /></SelectTrigger><SelectContent>{options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select>;
}
