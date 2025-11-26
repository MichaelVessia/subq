import type * as React from 'react'
import { cn } from '../../lib/utils.js'

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean | undefined
}

function Select({ className, error, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-destructive focus:border-destructive focus:ring-destructive/15',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export { Select }
