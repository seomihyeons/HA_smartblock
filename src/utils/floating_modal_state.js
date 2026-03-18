const openModalIds = new Set();

function syncFloatingButtonsVisibility() {
  const body = document.body;
  if (!body) return;
  body.classList.toggle('floating-buttons-hidden', openModalIds.size > 0);
}

export function setModalOpenState(modalId, isOpen) {
  const key = String(modalId || '').trim();
  if (!key) return;

  if (isOpen) openModalIds.add(key);
  else openModalIds.delete(key);

  syncFloatingButtonsVisibility();
}

