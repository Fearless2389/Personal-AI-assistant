import { cn } from '../../lib/utils.js';

const INTENT = {
  info: 'bg-info/15 text-info border-info/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/30',
  danger: 'bg-danger/15 text-danger border-danger/30',
  neutral: 'bg-surface-3 text-text-secondary border-surface-border',
  primary: 'bg-nexus-primary/15 text-nexus-primary border-nexus-primary/30'
};

export function Badge({ intent = 'neutral', className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        INTENT[intent] ?? INTENT.neutral,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export default Badge;
