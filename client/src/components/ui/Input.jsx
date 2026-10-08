import { forwardRef } from 'react';
import { cn } from '../../lib/utils.js';

export const Input = forwardRef(function Input({ as: Tag = 'input', className, ...props }, ref) {
  return (
    <Tag
      ref={ref}
      className={cn(
        'w-full rounded-lg bg-surface-3 border border-surface-border px-3 py-2',
        'text-sm text-text-primary placeholder:text-text-muted',
        'focus:outline-none focus:border-nexus-primary/60 focus:ring-2 focus:ring-nexus-primary/30',
        'transition-colors duration-150',
        Tag === 'textarea' && 'min-h-[80px] resize-y',
        className
      )}
      {...props}
    />
  );
});

export default Input;
