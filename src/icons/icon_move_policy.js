/**
 * A coordinate-only Blockly move translates the block and its icon together.
 * Only connection/input changes can alter the outline's geometry relative to
 * the leading icon, so skip expensive DOM measurements during normal drags.
 */
export function isStructuralBlockMove(event) {
  const oldParent = event?.oldParentId ?? null;
  const newParent = event?.newParentId ?? null;
  const oldInput = event?.oldInputName ?? null;
  const newInput = event?.newInputName ?? null;
  return oldParent !== newParent || oldInput !== newInput;
}
