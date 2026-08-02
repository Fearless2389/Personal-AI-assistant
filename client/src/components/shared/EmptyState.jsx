import { cn } from '../../lib/utils.js';

export function EmptyState({ icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center py-10 px-6', className)}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-surface-3 border border-surface-border grid place-items-center text-2xl text-text-secondary mb-4">
          {icon}
        </div>
      )}
      {title && <h3 className="font-display text-lg font-semibold text-text-primary mb-1">{title}</h3>}
      {description && <p className="text-sm text-text-secondary max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default EmptyState;
