'use client'

import { cn } from '../../lib/utils'

export function TableWrap({ className, children }) {
  return (
    <div className={cn('-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0', className)}>
      {children}
    </div>
  )
}

export function Table({ className, children, ...props }) {
  return (
    <table
      className={cn('w-full min-w-[640px] border-collapse text-left', className)}
      {...props}
    >
      {children}
    </table>
  )
}

export function Th({ className, children, align = 'left', ...props }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-neutral-200 bg-neutral-50/70 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 first:rounded-l-lg last:rounded-r-lg',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...props}
    >
      {children}
    </th>
  )
}

export function Td({ className, children, align = 'left', ...props }) {
  return (
    <td
      className={cn(
        'border-b border-neutral-100 px-4 py-3.5 text-sm text-neutral-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...props}
    >
      {children}
    </td>
  )
}

export function Tr({ className, children, ...props }) {
  return (
    <tr
      className={cn('transition-colors hover:bg-brand-50/40', className)}
      {...props}
    >
      {children}
    </tr>
  )
}
