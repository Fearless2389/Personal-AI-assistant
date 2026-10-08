import { cn } from '../../lib/utils.js';

export function Card({ as: Tag = 'div', className, children, padded = true, ...props }) {
  return (
    <Tag
      className={cn(
        'relative rounded-2xl border border-surface-border bg-surface-2',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.045),0_18px_40px_-28px_rgba(0,0,0,0.7)]',
        padded && 'p-5',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ children, className }) {
  return <div className={cn('mb-3 flex items-center justify-between', className)}>{children}</div>;
}

export function CardTitle({ children, className }) {
  return (
    <h3 className={cn('font-display text-base font-semibold text-text-primary', className)}>{children}</h3>
  );
}

export default Card;
