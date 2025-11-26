import type * as React from 'react'
import { cn } from '../../lib/utils.js'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean | undefined
}

function Input({ className, type, error, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 disabled:cursor-not-allowed disabled:opacity-50',
        error && 'border-destructive focus:border-destructive focus:ring-destructive/15',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
