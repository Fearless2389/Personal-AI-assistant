import { cn } from '../../lib/utils.js';

export function LoadingSpinner({ variant = 'dots', className }) {
  if (variant === 'bar') {
    return (
      <div className={cn('h-1 w-full rounded-full bg-surface-3 overflow-hidden', className)}>
        <div className="h-full w-1/3 bg-nexus-primary animate-[shimmer_1.2s_ease-in-out_infinite]" />
      </div>
    );
  }
  if (variant === 'skeleton') {
    return <div className={cn('shimmer rounded-lg h-4 w-full', className)} />;
  }
  // Default: pulsing dots
  return (
    <div className={cn('inline-flex items-center gap-1', className)} role="status" aria-label="Loading">
      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-pulse" style={{ animationDelay: '0ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-pulse" style={{ animationDelay: '150ms' }} />
      <span className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-pulse" style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export function FullScreenLoading() {
  return (
    <div className="min-h-dvh grid place-items-center bg-surface-base">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-nexus-primary to-nexus-secondary animate-pulse" />
        <LoadingSpinner />
      </div>
    </div>
  );
}

export default LoadingSpinner;
