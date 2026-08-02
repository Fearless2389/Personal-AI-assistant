import { cn } from '../../lib/utils.js';

export function Card({ as: Tag = 'div', className, children, padded = true, ...props }) {
  return (
    <Tag
      className={cn(
        'bg-surface-2 border border-surface-border rounded-xl',
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
