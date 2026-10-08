import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

const VARIANTS = {
  primary: 'bg-nexus-primary text-on-accent font-semibold hover:bg-nexus-primary-hover',
  secondary: 'bg-surface-3 text-text-primary hover:bg-surface-border',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-2 hover:text-text-primary',
  outline: 'border border-surface-border text-text-primary hover:bg-surface-2 hover:border-nexus-primary/40',
  danger: 'bg-danger text-white hover:opacity-90'
};

const SIZES = {
  sm: 'h-8 px-3 text-sm rounded-md',
  md: 'h-10 px-4 text-sm rounded-lg',
  lg: 'h-12 px-5 text-base rounded-lg'
};

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', className, type = 'button', disabled, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary/60 focus-visible:ring-offset-0',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export default Button;
