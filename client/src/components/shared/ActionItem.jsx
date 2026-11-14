// One thing Nexus did, as shown in the voice panel and the ⌘K bar: a confirmation
// card when the action waits for your OK, otherwise an action chip.
// resolve_pending_action renders nothing — its outcome shows on the card itself.
import { ActionChip } from './ActionChip.jsx';
import { ConfirmCard } from './ConfirmCard.jsx';
import { isShownAction } from '../../lib/confirmations.js';

export function ActionItem({ action, onNavigate, onDecide, hint }) {
  if (!isShownAction(action)) return null;
  if (action.result?.needs_confirmation) {
    return <ConfirmCard id={action.result.confirmation_id} onDecide={onDecide} hint={hint} />;
  }
  return <ActionChip action={action} onNavigate={onNavigate} />;
}

export default ActionItem;
