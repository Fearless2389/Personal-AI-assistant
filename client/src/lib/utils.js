import { formatDistanceToNow, format, isValid, parseISO } from 'date-fns';

export function cn(...args) {
  return args
    .flat(Infinity)
    .filter(x => typeof x === 'string' && x.length > 0)
    .join(' ');
}

export function asDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : null;
  }
  return null;
}

export function formatRelative(value) {
  const d = asDate(value);
  if (!d) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatDate(value, pattern = 'MMM d, yyyy h:mm a') {
  const d = asDate(value);
  if (!d) return '';
  return format(d, pattern);
}

export function priorityColor(priority) {
  switch (priority) {
    case 'high': return 'var(--color-danger)';
    case 'medium': return 'var(--color-warning)';
    case 'low': return 'var(--color-success)';
    default: return 'var(--color-text-muted)';
  }
}
