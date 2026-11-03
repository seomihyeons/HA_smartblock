let activeDialog = null;

function getFocusableButtons(dialog) {
  return Array.from(dialog.querySelectorAll('button:not([disabled])'));
}

/**
 * Shows the user-study replacement warning. Every dismissal path resolves to
 * false so a dirty Blockly workspace is never replaced accidentally.
 */
export function confirmDiscardUnsavedChanges({ loadingDescription } = {}) {
  if (activeDialog) return activeDialog;

  const backdrop = document.createElement('div');
  backdrop.className = 'ha-unsaved-dialog-backdrop';

  const dialog = document.createElement('section');
  dialog.className = 'ha-unsaved-dialog ha-unsaved-changes-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'haUnsavedDialogTitle');
  dialog.setAttribute('aria-describedby', 'haUnsavedDialogDescription haUnsavedDialogDetail');

  const title = document.createElement('h2');
  title.id = 'haUnsavedDialogTitle';
  title.textContent = 'Unsaved changes';

  const description = document.createElement('p');
  description.id = 'haUnsavedDialogDescription';
  description.textContent = loadingDescription || 'Loading another automation will replace your current blocks.';

  const detail = document.createElement('p');
  detail.id = 'haUnsavedDialogDetail';
  detail.className = 'ha-unsaved-dialog-detail';
  detail.textContent = 'Your current changes have not been pushed to Home Assistant.';

  const actions = document.createElement('div');
  actions.className = 'ha-unsaved-dialog-actions';
  const keepButton = document.createElement('button');
  keepButton.type = 'button';
  keepButton.className = 'ha-unsaved-dialog-keep';
  keepButton.textContent = 'Keep editing';
  const discardButton = document.createElement('button');
  discardButton.type = 'button';
  discardButton.className = 'ha-unsaved-dialog-discard';
  discardButton.textContent = 'Discard changes and load';
  actions.append(keepButton, discardButton);
  dialog.append(title, description, detail, actions);
  backdrop.appendChild(dialog);

  activeDialog = new Promise((resolve) => {
    const close = (confirmed) => {
      document.removeEventListener('keydown', onKeyDown, true);
      backdrop.remove();
      activeDialog = null;
      resolve(confirmed);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const buttons = getFocusableButtons(dialog);
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    keepButton.addEventListener('click', () => close(false));
    discardButton.addEventListener('click', () => close(true));
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(backdrop);
    keepButton.focus();
  });

  return activeDialog;
}
