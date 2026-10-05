'use client'

import React from 'react'
import { cn } from '../../lib/utils'
import { tone } from '../../lib/theme'

const Button = React.forwardRef(function Button(
  {
    className,
    variant = 'default',
    tone: toneName,
    size = 'default',
    asChild = false,
    children,
    ...props
  },
  ref
) {
  const resolved = tone(toneName)

  const variants = {
    /* Aksi utama: terracotta dengan bayangan berwarna. */
    primary: cn(
      'bg-brand-600 text-white shadow-[0_8px_20px_-10px_rgba(201,111,66,.75)]',
      'hover:bg-brand-700 active:bg-brand-800'
    ),
    /* Aksen per-kartu (tone). */
    accent: cn(resolved.solid, 'shadow-[0_8px_20px_-12px_rgba(60,44,30,.6)]'),
    /* Aksi netral-pekat, dipakai saat aksen brand sudah dipakai. */
    default: 'bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-900',
    outline: cn(
      'border bg-paper',
      toneName ? resolved.outline : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
    ),
    ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100',
    subtle: 'bg-neutral-100 text-neutral-800 hover:bg-neutral-200',
    link: 'bg-transparent px-0 text-brand-700 underline-offset-4 hover:underline',
  }

  const sizes = {
    sm: 'h-9 rounded-lg px-3 text-[13px]',
    default: 'h-10 rounded-xl px-4',
    lg: 'h-11 rounded-xl px-5',
    icon: 'h-10 w-10 rounded-xl',
  }

  const classes = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
    'disabled:pointer-events-none disabled:opacity-50',
    variants[variant] || variants.default,
    sizes[size] || sizes.default,
    className
  )

  if (asChild) {
    const child = React.Children.only(children)

    return React.cloneElement(child, {
      ...props,
      ref,
      className: cn(classes, child.props.className),
    })
  }

  return (
    <button
      ref={ref}
      className={classes}
      {...props}
    >
      {children}
    </button>
  )
})

Button.displayName = 'Button'

export { Button }
