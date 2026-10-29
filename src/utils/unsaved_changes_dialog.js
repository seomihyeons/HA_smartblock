let activeDialog = null;

function getFocusableElements(dialog) {
  return Array.from(dialog.querySelectorAll('button:not([disabled])'));
}

function showConfirmationDialog({
  dialogClass,
  titleId,
  describedBy,
  titleText,
  content,
  cancelLabel,
  cancelClass,
  confirmLabel,
  confirmClass,
  initialFocus = 'cancel',
}) {
  if (activeDialog) return activeDialog.promise;

  const backdrop = document.createElement('div');
  backdrop.className = 'ha-unsaved-dialog-backdrop';

  const dialog = document.createElement('section');
  dialog.className = `ha-unsaved-dialog ${dialogClass}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  if (describedBy) dialog.setAttribute('aria-describedby', describedBy);

  const title = document.createElement('h2');
  title.id = titleId;
  title.textContent = titleText;

  const actions = document.createElement('div');
  actions.className = 'ha-unsaved-dialog-actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className = cancelClass;
  cancelButton.textContent = cancelLabel;

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className = confirmClass;
  confirmButton.textContent = confirmLabel;

  actions.append(cancelButton, confirmButton);
  dialog.append(title, ...content, actions);
  backdrop.appendChild(dialog);

  let close;
  const promise = new Promise((resolve) => {
    close = (confirmed) => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
      activeDialog = null;
      resolve(confirmed);
    };
  });

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = getFocusableElements(dialog);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  cancelButton.addEventListener('click', () => close(false));
  confirmButton.addEventListener('click', () => close(true));
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close(false);
  });
  document.addEventListener('keydown', onKeyDown, true);
  document.body.appendChild(backdrop);
  (initialFocus === 'confirm' ? confirmButton : cancelButton).focus();

  activeDialog = { promise };
  return promise;
}

/**
 * Resolves false for every dismissal path so continuing to edit is the safe
 * default before replacing a dirty Blockly workspace.
 */
export function confirmDiscardUnsavedChanges({ loadingDescription } = {}) {
  const description = document.createElement('p');
  description.id = 'haUnsavedDialogDescription';
  description.textContent = loadingDescription || 'Loading another automation will replace your current blocks.';

  const detail = document.createElement('p');
  detail.id = 'haUnsavedDialogDetail';
  detail.className = 'ha-unsaved-dialog-detail';
  detail.textContent = 'Your current changes have not been pushed to Home Assistant.';

  return showConfirmationDialog({
    dialogClass: 'ha-unsaved-changes-dialog',
    titleId: 'haUnsavedDialogTitle',
    describedBy: 'haUnsavedDialogDescription haUnsavedDialogDetail',
    titleText: 'Unsaved changes',
    content: [description, detail],
    cancelLabel: 'Keep editing',
    cancelClass: 'ha-unsaved-dialog-keep',
    confirmLabel: 'Discard changes and load',
    confirmClass: 'ha-unsaved-dialog-discard',
  });
}

export function confirmPushToHomeAssistant({ name, id } = {}) {
  const details = document.createElement('dl');
  details.id = 'haPushDialogDetails';
  details.className = 'ha-push-dialog-details';

  const addDetail = (label, value) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    details.append(term, definition);
  };

  addDetail('Name', String(name || 'SmartBlock Automation'));
  addDetail('ID', String(id || '(generated on push)'));

  return showConfirmationDialog({
    dialogClass: 'ha-push-dialog',
    titleId: 'haPushDialogTitle',
    describedBy: 'haPushDialogDetails',
    titleText: 'Push to Home Assistant?',
    content: [details],
    cancelLabel: 'Cancel',
    cancelClass: 'ha-push-dialog-cancel',
    confirmLabel: 'Push to Home Assistant',
    confirmClass: 'ha-push-dialog-confirm',
    initialFocus: 'confirm',
  });
}
