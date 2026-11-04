/**
 * Classifies the requested operation on an existing automation without confusing
 * embedded condition verbs ("check whether someone is home") with inspection.
 * This is only a UI hint; the server remains the authority for whether a
 * selected automation may be modified.
 */
export function automationOperationFor(command, hasActiveAutomationContext = false) {
  const request = String(command || '').normalize('NFKC').toLowerCase().trim();
  const existingReference = /\b(earlier|previous|existing|current|this|that|we created|the automation|these blocks|those blocks)\b|아까|이전|앞서|기존|현재|이 자동화|이 블록/.test(request);
  const creationRequest = /\b(create|build|make|set up)\b.{0,80}\b(automation|rule)\b|자동화.{0,16}(만들|생성)/.test(request);
  const directModification = /\b(modify|edit|update|revise|remove|replace|delete)\b|수정|편집|추가|삭제|변경/.test(request);
  const partialModification = /\b(add|change)\b.{0,100}\b(condition|trigger|action|automation|rule|block|time|device|sensor|light)\b/.test(request);
  const modify = directModification || partialModification;
  // Describing how to edit an automation is not an edit request.
  const explanationLead = /^(?:please\s+)?(?:explain|describe|what does|what is this)\b/.test(request);
  const explicitFollowupEdit = /\b(?:and|then)\s+(?:modify|edit|update|change|add|remove|replace)\b/.test(request);
  if (explanationLead && !explicitFollowupEdit) return 'explain';
  const inspectionLead = /^(?:please\s+)?(?:check|inspect|review|validate)\b/.test(request);
  if (inspectionLead && /\b(?:how to|whether)\b/.test(request) && !explicitFollowupEdit) return 'inspect';
  // "Create an automation that checks ..." remains a new rule, even when a
  // previously created draft happens to be selected in the editor.
  if (creationRequest && !existingReference) return 'create';
  if (modify && (hasActiveAutomationContext || existingReference)) return 'modify';
  if (/\b(explain|describe|what does|what is this)\b|설명|무슨.{0,12}동작/.test(request)) return 'explain';
  if (/\b(inspect|check|validate|review)\b|검사|점검|검토/.test(request)) return 'inspect';
  return 'create';
}
