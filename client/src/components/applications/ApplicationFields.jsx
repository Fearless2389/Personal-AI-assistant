// Form fields for an application — shared by the "Add" modal and the detail drawer.
// Controlled: `value` is a draft object, `onChange` receives the next draft.
import { Input } from '../ui/Input.jsx';
import { cn } from '../../lib/utils.js';
import { STAGES, CLOSED_STAGES, CHANNELS, toLocalInput, fromLocalInput } from '../../lib/applications.js';

function Label({ children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] uppercase tracking-[0.14em] text-text-muted mb-1.5">
      {children}
    </label>
  );
}

function Segmented({ options, value, onChange, ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-nexus-primary/40',
              active
                ? 'border-transparent bg-surface-3 text-text-primary'
                : 'border-surface-border text-text-secondary hover:text-text-primary hover:bg-surface-3/50'
            )}
            style={active && o.color ? { boxShadow: `inset 0 0 0 1px ${o.color}` } : undefined}
          >
            {o.color && <span className="w-1.5 h-1.5 rounded-full" style={{ background: o.color }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ApplicationFields({ value, onChange, showClosedStages = false, autoFocus = false }) {
  const set = (key) => (v) => onChange({ ...value, [key]: v });
  const stageOptions = showClosedStages ? [...STAGES, ...CLOSED_STAGES] : STAGES;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="app-company">Company</Label>
          <Input
            id="app-company"
            value={value.company}
            onChange={(e) => set('company')(e.target.value)}
            placeholder="e.g. Atlassian"
            autoFocus={autoFocus}
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="app-role">Role</Label>
          <Input
            id="app-role"
            value={value.role ?? ''}
            onChange={(e) => set('role')(e.target.value)}
            placeholder="e.g. SWE Intern"
            maxLength={120}
          />
        </div>
      </div>

      <div>
        <Label>Stage</Label>
        <Segmented options={stageOptions} value={value.stage} onChange={set('stage')} ariaLabel="Stage" />
      </div>

      <div>
        <Label>Channel</Label>
        <Segmented options={CHANNELS} value={value.channel} onChange={set('channel')} ariaLabel="Channel" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="app-next">Next step</Label>
          <Input
            id="app-next"
            value={value.next_step ?? ''}
            onChange={(e) => set('next_step')(e.target.value)}
            placeholder="e.g. Online assessment"
            maxLength={120}
          />
        </div>
        <div>
          <Label htmlFor="app-deadline">Due</Label>
          <Input
            id="app-deadline"
            type="datetime-local"
            value={toLocalInput(value.next_deadline)}
            onChange={(e) => set('next_deadline')(fromLocalInput(e.target.value))}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="app-link">Link</Label>
        <Input
          id="app-link"
          type="url"
          value={value.link ?? ''}
          onChange={(e) => set('link')(e.target.value)}
          placeholder="Job posting or portal URL"
        />
      </div>

      <div>
        <Label htmlFor="app-notes">Notes</Label>
        <Input
          as="textarea"
          id="app-notes"
          value={value.notes ?? ''}
          onChange={(e) => set('notes')(e.target.value)}
          placeholder="Referral, recruiter name, what they asked…"
        />
      </div>
    </div>
  );
}

export default ApplicationFields;
