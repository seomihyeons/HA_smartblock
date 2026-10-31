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
  singleAction = false,
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

  if (!singleAction) actions.appendChild(cancelButton);
  actions.appendChild(confirmButton);
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
  (singleAction || initialFocus === 'confirm' ? confirmButton : cancelButton).focus();

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

function formatDisconnectedSummary({ groupCount = 0, blockCount = 0 } = {}) {
  const groups = Math.max(0, Number(groupCount) || 0);
  const blocks = Math.max(0, Number(blockCount) || 0);
  if (!groups) return '';
  const groupNoun = groups === 1 ? 'group' : 'groups';
  const blockNoun = blocks === 1 ? 'block' : 'blocks';
  return `${groups} disconnected block ${groupNoun} (${blocks} ${blockNoun}) will not be included in this automation.`;
}

export function confirmPushToHomeAssistant({ name, id, disconnectedSummary } = {}) {
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

  const disconnectedText = formatDisconnectedSummary(disconnectedSummary);
  const content = [details];
  let describedBy = 'haPushDialogDetails';
  if (disconnectedText) {
    const warning = document.createElement('p');
    warning.id = 'haPushDialogDisconnected';
    warning.className = 'ha-unsaved-dialog-detail';
    warning.textContent = disconnectedText;
    content.push(warning);
    describedBy += ' haPushDialogDisconnected';
  }

  return showConfirmationDialog({
    dialogClass: 'ha-push-dialog',
    titleId: 'haPushDialogTitle',
    describedBy,
    titleText: 'Push to Home Assistant?',
    content,
    cancelLabel: 'Cancel',
    cancelClass: 'ha-push-dialog-cancel',
    confirmLabel: 'Push to Home Assistant',
    confirmClass: 'ha-push-dialog-confirm',
    initialFocus: 'confirm',
  });
}

export function confirmDisconnectedBlocks({ groupCount = 0, blockCount = 0 } = {}) {
  const safeGroups = Math.max(0, Number(groupCount) || 0);
  const safeBlocks = Math.max(0, Number(blockCount) || 0);
  const groupNoun = safeGroups === 1 ? 'group' : 'groups';
  const blockNoun = safeBlocks === 1 ? 'block' : 'blocks';

  const description = document.createElement('p');
  description.id = 'haDisconnectedBlocksDescription';
  description.textContent = `${safeGroups} disconnected block ${groupNoun} (${safeBlocks} ${blockNoun}) will not be included in YAML.`;

  const detail = document.createElement('p');
  detail.id = 'haDisconnectedBlocksDetail';
  detail.className = 'ha-unsaved-dialog-detail';
  detail.textContent = 'They will remain in your workspace, but will not be copied, exported, or sent to Home Assistant.';

  return showConfirmationDialog({
    dialogClass: 'ha-disconnected-blocks-dialog',
    titleId: 'haDisconnectedBlocksTitle',
    describedBy: 'haDisconnectedBlocksDescription haDisconnectedBlocksDetail',
    titleText: 'Disconnected blocks detected',
    content: [description, detail],
    cancelLabel: 'Cancel',
    cancelClass: 'ha-push-dialog-cancel',
    confirmLabel: 'Continue anyway',
    confirmClass: 'ha-push-dialog-confirm',
  });
}

/** Shows output validation errors without offering a route to bypass them. */
export function showOutputValidationIssues(issues = []) {
  const messages = [...new Set((issues || []).map((issue) => issue?.message).filter(Boolean))];
  const description = document.createElement('p');
  description.id = 'haOutputValidationDescription';
  description.textContent = 'Resolve the following issue before continuing:';

  const list = document.createElement('ul');
  list.id = 'haOutputValidationList';
  list.className = 'ha-output-validation-list';
  messages.forEach((message) => {
    const item = document.createElement('li');
    item.textContent = message;
    list.appendChild(item);
  });

  return showConfirmationDialog({
    dialogClass: 'ha-output-validation-dialog',
    titleId: 'haOutputValidationTitle',
    describedBy: 'haOutputValidationDescription haOutputValidationList',
    titleText: 'Automation cannot be output',
    content: [description, list],
    cancelLabel: 'Close',
    cancelClass: 'ha-push-dialog-cancel',
    confirmLabel: 'Back to editing',
    confirmClass: 'ha-push-dialog-confirm',
    initialFocus: 'confirm',
    singleAction: true,
  });
}
