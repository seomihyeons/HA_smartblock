import './assistant.css';
import { setModalOpenState } from '../../utils/floating_modal_state';
import { yamlTextToInternalJson } from '../../import/yaml_import.js';

const $ = (id) => document.getElementById(id);

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
}

function firstEntityId(value) {
  if (Array.isArray(value)) return String(value[0] || '');
  return String(value || '');
}

function actionName(action) {
  return String(action?.action || action?.service || '');
}

function setStatus(element, state, message) {
  element.className = `ai-assistant-status state-${state}`;
  element.textContent = message;
}

// The API keeps the final language choice explicit.  The UI supplies a
// lightweight default for the two languages currently exposed by the panel;
// API clients may send response_language directly.
function responseLanguageFor(command) {
  return /[가-힣]/.test(String(command || '')) ? 'ko' : 'en';
}

function automationOperationFor(command, hasActiveAutomationContext = false) {
  const request = String(command || '').toLowerCase();
  if (/(explain|describe|what does|what is this|설명|무슨.*동작)/.test(request)) return 'explain';
  if (/(inspect|check|validate|issue|problem|검사|점검|문제)/.test(request)) return 'inspect';
  const modificationVerb = /(modify|edit|change|update|add|remove|replace|수정|편집|추가|삭제|변경)/.test(request);
  const contextualReference = /(earlier|previous|before|current|this|these|that|we created|the automation|blocks?|아까|이전|앞서|현재|이 자동화|이 블록)/.test(request);
  // “Add” and “change” also appear in requests to create a brand-new rule.
  // Treat them as modifications only with an explicit/current automation
  // context; a title-based draft selection is resolved immediately below.
  if (modificationVerb && (hasActiveAutomationContext || contextualReference)) return 'modify';
  return 'create';
}

function titleForAutomation(automation, fallback = 'Automation draft') {
  return String(automation?.alias || automation?.id || fallback);
}

import { confirmDiscardUnsavedChanges } from '../../utils/unsaved_changes_dialog.js';

export function initAiAssistantUI({ ws, renderAutomationToWorkspace, getWorkspaceYaml, confirmBeforeReplace }) {
  const openButton = $('btnAiAssistant');
  const panel = $('aiAssistantPanel');
  const backdrop = $('aiAssistantBackdrop');
  const closeButton = $('aiAssistantClose');
  const form = $('aiAssistantForm');
  const input = $('aiAssistantInput');
  const sendButton = $('aiAssistantSend');
  const providerSelect = $('aiAssistantProvider');
  const messages = $('aiAssistantMessages');
  const status = $('aiAssistantStatus');

  if (!openButton || !panel || !closeButton || !form || !input || !messages || !status || !providerSelect) {
    return;
  }

  let activeCommand = '';
  let conversation = [];
  let selections = {};
  let slots = { entity_references: {} };
  // This is deliberately not chat-history memory.  It records only one
  // server-confirmed live entity so a short follow-up such as "open it" can
  // be grounded without asking the model to reinterpret an entire transcript.
  let interactionContext = { last_confirmed_target: null };
  let awaitingClarification = false;
  let busy = false;
  let providerReady = false;
  let selectedProvider = '';
  let providerLoadPromise = null;
  let draftSequence = 0;
  let recentDrafts = [];
  let activeAutomationContext = null;
  let activeAutomationOperation = 'create';
  let pendingAutomationCommand = null;

  const workspaceContext = () => {
    const yaml = typeof getWorkspaceYaml === 'function' ? String(getWorkspaceYaml() || '').trim() : '';
    if (!yaml) return null;
    try {
      const automation = yamlTextToInternalJson(yaml);
      return {
        source: 'workspace',
        title: titleForAutomation(automation, 'Current Blockly automation'),
        base_yaml: yaml,
        enabled: true,
      };
    } catch {
      return { source: 'workspace', title: 'Current Blockly automation', base_yaml: yaml, enabled: true };
    }
  };

  const scrollToLatest = () => {
    messages.scrollTop = messages.scrollHeight;
  };

  const appendMessage = (role, message, extraClass = '') => {
    const className = [
      'ai-message',
      role === 'user' ? 'ai-message-user' : 'ai-message-assistant',
      extraClass,
    ].filter(Boolean).join(' ');
    messages.appendChild(createElement('div', className, message));
    scrollToLatest();
  };

  const contextBar = createElement('section', 'ai-automation-context');
  contextBar.setAttribute('aria-label', 'Automation editing context');
  panel.querySelector('.ai-assistant-meta')?.insertAdjacentElement('afterend', contextBar);

  const selectContext = (context) => {
    activeAutomationContext = context || null;
    renderContextBar();
  };

  const renderRecentDraftPicker = () => {
    if (!recentDrafts.length) {
      appendMessage('assistant', 'There are no automation drafts in this chat yet.');
      return;
    }
    const picker = createElement('section', 'ai-draft-picker');
    picker.appendChild(createElement('div', 'ai-draft-picker-title', 'Recent drafts in this chat'));
    recentDrafts.forEach((draft) => {
      const button = createElement('button', 'ai-draft-picker-item');
      button.type = 'button';
      button.appendChild(createElement('strong', '', draft.title));
      button.appendChild(createElement('span', '', `${draft.imported_to_blockly ? 'Imported to Blockly' : 'Draft only'} · ${draft.enabled === false ? 'Disabled' : 'Enabled'}`));
      button.addEventListener('click', () => {
        if (picker.dataset.selectionInProgress === 'true') return;
        picker.dataset.selectionInProgress = 'true';
        selectContext(draft);
        picker.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        if (pendingAutomationCommand) {
          const command = pendingAutomationCommand;
          pendingAutomationCommand = null;
          void resumeSelectedAutomationCommand(command, draft);
        }
      });
      picker.appendChild(button);
    });
    messages.appendChild(picker);
    scrollToLatest();
  };

  function renderContextBar() {
    contextBar.textContent = '';
    const context = activeAutomationContext;
    contextBar.hidden = !context;
    if (!context) return;
    const source = context.source === 'recent_draft' ? 'recent draft' : 'current Blockly workspace';
    contextBar.appendChild(createElement('span', 'ai-automation-context-label', `Editing: ${context.title} · ${source}`));
  }

  const renderWelcome = () => {
    messages.textContent = '';
    const section = createElement('section', 'ai-assistant-welcome');
    section.id = 'aiAssistantWelcome';
    section.appendChild(createElement('h2', '', 'Ask HA-SmartBlock'));
    section.appendChild(createElement(
      'p',
      '',
      'Describe an automation or request a supported device action. Clear, grounded device commands run immediately; automation saving still requires Push to HA.',
    ));
    const example = createElement('div', 'ai-welcome-example');
    example.appendChild(createElement('span', '', 'Examples'));
    example.appendChild(createElement(
      'code',
      '',
      'When entrance motion is detected, turn on the living room light. · Turn on the coffee maker.',
    ));
    section.appendChild(example);
    section.appendChild(createElement(
      'div',
      'ai-welcome-safety',
      'Requests are routed automatically · Ambiguous device requests require a choice · Automation saving still requires Push to HA',
    ));
    messages.appendChild(section);
  };

  const resetConversationForProvider = () => {
    activeCommand = '';
    conversation = [];
    selections = {};
    slots = { entity_references: {} };
    interactionContext = { last_confirmed_target: null };
    awaitingClarification = false;
    recentDrafts = [];
    activeAutomationContext = null;
    pendingAutomationCommand = null;
    renderWelcome();
    renderContextBar();
  };

  // Render before the first open as well as after a provider change. The
  // panel must never open as an empty message area while provider status loads.
  renderWelcome();
  renderContextBar();

  const contextForOperation = (operation, command = '') => {
    if (operation === 'create') return null;
    if (/(current\s+(blockly|blocks|workspace)|these\s+blocks|현재.*블록)/i.test(String(command))) {
      const workspace = workspaceContext();
      if (workspace) {
        selectContext(workspace);
        return workspace;
      }
    }
    // An explicit draft title is sufficient even when there are several
    // artifacts in this chat. A title-free “earlier/previous” reference is
    // deliberately ambiguous and must show the picker instead.
    const normalizedCommand = String(command).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
    const titleMatches = recentDrafts.filter((draft) => {
      const title = String(draft.title || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      return title.length >= 4 && normalizedCommand.includes(title);
    });
    if (titleMatches.length === 1) {
      selectContext(titleMatches[0]);
      return titleMatches[0];
    }
    if (recentDrafts.length > 1 && /(earlier|previous|before|아까|이전|앞서)/i.test(String(command))) {
      return null;
    }
    if (activeAutomationContext?.base_yaml) return activeAutomationContext;
    const workspace = workspaceContext();
    if (workspace) {
      selectContext(workspace);
      return workspace;
    }
    if (recentDrafts.length === 1) {
      selectContext(recentDrafts[0]);
      return recentDrafts[0];
    }
    return null;
  };

  const loadProviders = async () => {
    if (providerLoadPromise) return providerLoadPromise;
    providerLoadPromise = (async () => {
      providerSelect.disabled = true;
      try {
        const response = await fetch('/api/llm/providers');
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Provider status is unavailable.');

        const providers = Array.isArray(result.providers) ? result.providers : [];
        const configured = providers.filter((provider) => provider?.configured === true);
        providerSelect.textContent = '';
        providers.forEach((provider) => {
          const option = document.createElement('option');
          option.value = provider.id;
          option.textContent = provider.configured ? provider.label : `${provider.label} · Not configured`;
          option.disabled = !provider.configured;
          providerSelect.appendChild(option);
        });
        const preferred = providers.find((provider) => (
          provider.id === result.default_provider && provider.configured
        )) || configured[0];
        if (!preferred) throw new Error('No configured LLM provider is available.');

        selectedProvider = preferred.id;
        providerSelect.value = selectedProvider;
        providerReady = true;
        providerSelect.disabled = false;
        setStatus(status, 'idle', 'Ready');
      } catch (error) {
        providerReady = false;
        providerSelect.textContent = '';
        const option = document.createElement('option');
        option.textContent = 'No provider available';
        providerSelect.appendChild(option);
        setStatus(status, 'error', 'No configured LLM provider is available');
      }
    })();
    return providerLoadPromise;
  };

  const openPanel = () => {
    panel.classList.remove('hidden');
    setModalOpenState('aiAssistantPanel', true);
    void loadProviders();
    window.setTimeout(() => input.focus(), 0);
  };

  const closePanel = () => {
    panel.classList.add('hidden');
    setModalOpenState('aiAssistantPanel', false);
  };

  const importDraft = async (automation, button, artifact = null) => {
    const hasBlocks = typeof ws?.getAllBlocks === 'function' && ws.getAllBlocks(false).length > 0;
    const confirmReplace = typeof confirmBeforeReplace === 'function'
      ? confirmBeforeReplace
      : async (proceed) => (hasBlocks ? proceed() : true);
    if (!await confirmReplace(() => confirmDiscardUnsavedChanges({
      loadingDescription: 'Importing this automation draft will replace your current blocks.',
    }))) {
      return false;
    }

    try {
      button.disabled = true;
      renderAutomationToWorkspace(ws, automation, { clearBefore: true });
      if (artifact) {
        artifact.imported_to_blockly = true;
        artifact.base_yaml = typeof getWorkspaceYaml === 'function' ? String(getWorkspaceYaml() || artifact.base_yaml || '') : artifact.base_yaml;
        selectContext(artifact);
      } else {
        selectContext(workspaceContext());
      }
      appendMessage('assistant', 'The validated draft was imported and its YAML regenerated. Use Push to HA separately to save it.');
      setStatus(status, 'done', 'Imported to Blockly · YAML regenerated · Not saved to Home Assistant');
      if (button?.textContent === 'Import blocks') button.textContent = 'Re-import blocks';
      return true;
    } catch (error) {
      button.disabled = false;
      appendMessage('assistant', `Blockly import failed.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Blockly import failed');
      return false;
    } finally {
      // Import replaces the current workspace but is intentionally repeatable:
      // users may return to a draft after editing or inspecting other blocks.
      button.disabled = false;
    }
  };

  const renderDraft = (result, artifact) => {
    const automation = result.automation || {};
    const trigger = automation.triggers?.[0] || {};
    const hasTrigger = Array.isArray(automation.triggers) && automation.triggers.length > 0;
    const actionsList = Array.isArray(automation.actions) ? automation.actions : [];
    const card = createElement('section', 'ai-draft-card');
    const isModification = result.operation === 'modify';
    card.appendChild(createElement('div', 'ai-draft-title', isModification
      ? `Proposed update · ${automation.alias || 'Automation'}`
      : automation.alias || 'Automation draft'));
    card.appendChild(createElement(
      'div',
      'ai-draft-row',
      hasTrigger
        ? `Trigger · ${firstEntityId(trigger.entity_id)} · ${trigger.from || '*'} → ${trigger.to || '*'}`
        : 'Trigger · Manual run draft',
    ));
    actionsList.forEach((action, index) => {
      const targets = Array.isArray(action.target?.entity_id)
        ? action.target.entity_id.join(', ')
        : firstEntityId(action.target?.entity_id);
      card.appendChild(createElement(
        'div',
        'ai-draft-row',
        `Action ${index + 1} · ${actionName(action)} · ${targets}`,
      ));
    });

    const assumptions = [
      ...(result.pipeline?.goal_analysis?.assumptions || []),
      ...(result.pipeline?.policy_notes || []),
    ];
    if (assumptions.length) {
      const goalAnalysis = result.pipeline?.goal_analysis || {};
      const noteLabel = goalAnalysis.inferred_action
        ? `Conservative Policy Gate · ${goalAnalysis.goal_category || 'inferred_goal'}`
        : 'Draft notes';
      card.appendChild(createElement(
        'div',
        'ai-draft-assumptions',
        `${noteLabel} · ${assumptions.join(' · ')}`,
      ));
    }

    const validation = result.validation || {};
    const validationText = validation.schema_valid && validation.grounded && validation.blockly_supported
      ? '✓ Schema · ✓ Entity grounding · ✓ Blockly support'
      : 'Validation results are unavailable.';
    card.appendChild(createElement('div', 'ai-draft-validation', validationText));

    const actions = createElement('div', 'ai-draft-actions');
    const importButton = createElement('button', '', isModification ? 'Apply changes' : 'Import blocks');
    importButton.type = 'button';
    importButton.addEventListener('click', async () => importDraft(automation, importButton, artifact));
    actions.appendChild(importButton);

    const analyzeButton = createElement('button', '', 'Import and analyze conflicts');
    analyzeButton.type = 'button';
    analyzeButton.addEventListener('click', async () => {
      const imported = await importDraft(automation, analyzeButton, artifact);
      if (!imported) return;
      closePanel();
      document.dispatchEvent(new CustomEvent('open-conflict-analyzer', {
        detail: {
          autoRun: true,
          source: 'ai-assistant',
          draftYaml: typeof getWorkspaceYaml === 'function' ? getWorkspaceYaml() : null,
        },
      }));
    });
    actions.appendChild(analyzeButton);
    card.appendChild(actions);
    messages.appendChild(card);
    scrollToLatest();
  };

  const requestAssistant = async (selectedEntityId = null) => {
    busy = true;
    sendButton.disabled = true;
    input.disabled = true;
    setStatus(status, 'running', 'Understanding request · Loading Home Assistant context...');
    try {
      const response = await fetch('/api/assistant/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: activeCommand,
          response_language: responseLanguageFor(activeCommand),
          conversation,
          context_source: 'live_ha',
          selections,
          slots,
          interaction_context: interactionContext,
          automation_context: activeAutomationOperation !== 'create' && activeAutomationContext ? {
            operation: 'modify',
            source: activeAutomationContext.source,
            title: activeAutomationContext.title,
            draft_id: activeAutomationContext.draft_id || null,
            automation_id: activeAutomationContext.automation_id || null,
            enabled: activeAutomationContext.enabled !== false,
            base_yaml: activeAutomationContext.base_yaml,
          } : undefined,
          selected_entity_id: selectedEntityId,
          provider: selectedProvider || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = result.code ? `${result.code}: ${result.error || 'Request failed'}` : result.error;
        throw new Error(detail || `Assistant request failed: ${response.status}`);
      }

      if (result.system?.status === 'error') {
        throw new Error(result.message || 'Assistant plan validation failed.');
      }
      const resolution = result.resolution || {};
      if (resolution.status === 'success') {
        awaitingClarification = false;
        const payload = result.result || {};
        if (payload.kind === 'control') {
          if (payload?.target_count === 1 && payload?.entity?.entity_id) {
            interactionContext = {
              last_confirmed_target: {
                entity_id: String(payload.entity.entity_id),
                source: 'executed_control',
              },
            };
          }
          appendMessage('assistant', result.message || 'The requested action was completed.');
          setStatus(status, 'done', 'Completed');
          return;
        }
        if (payload.kind === 'information') {
          if (payload?.entity?.entity_id) {
            interactionContext = {
              last_confirmed_target: {
                entity_id: String(payload.entity.entity_id),
                source: 'information_query',
              },
            };
          }
          appendMessage('assistant', result.message || payload.answer || '현재 Home Assistant 정보를 조회했습니다.');
          setStatus(status, 'done', 'Live Home Assistant state retrieved · Nothing executed');
          return;
        }
        if (payload.kind === 'automation') {
          appendMessage('assistant', result.message || '검증된 자동화 초안을 만들었습니다.');
          const artifact = {
            draft_id: `draft-${Date.now()}-${++draftSequence}`,
            source: 'recent_draft',
            title: titleForAutomation(payload.automation),
            base_yaml: String(payload.normalized_yaml || payload.yaml || ''),
            automation: payload.automation,
            enabled: payload.base_context?.enabled !== false,
            imported_to_blockly: false,
            created_at: Date.now(),
          };
          recentDrafts = [artifact, ...recentDrafts].slice(0, 12);
          selectContext(artifact);
          renderDraft({ ...payload, operation: payload.operation || activeAutomationOperation }, artifact);
          setStatus(status, 'done', `Validated draft · ${result.model || result.provider || 'provider'}`);
          selections = {};
          return;
        }
        appendMessage('assistant', result.message || '요청을 처리했습니다.');
        setStatus(status, 'done', 'Completed');
        return;
      }

      if (resolution.status === 'ambiguous') {
        awaitingClarification = false;
        const question = result.message || 'Select the entity to use.';
        appendMessage('assistant', question);
        conversation.push({ role: 'assistant', content: question });
        const korean = responseLanguageFor(activeCommand) === 'ko';
        const list = createElement('section', 'ai-candidate-list');
        const cards = createElement('div', 'ai-candidate-cards');
        for (const candidate of result.candidates || []) {
          const displayName = candidate.display_name || candidate.name || candidate.entity_id;
          const label = candidate.area ? `${displayName} · ${candidate.area}` : displayName;
          const button = createElement('button', 'ai-candidate-card');
          button.type = 'button';
          button.setAttribute('aria-label', displayName);
          const top = createElement('div', 'ai-candidate-card-top');
          const name = createElement('span', 'ai-candidate-card-name', displayName);
          top.appendChild(name);
          if (candidate.state != null && candidate.state !== '') {
            top.appendChild(createElement('span', 'ai-candidate-card-state', String(candidate.state)));
          }
          button.appendChild(top);
          button.addEventListener('click', async () => {
            const selectionMessage = `Selected entity: ${candidate.entity_id}`;
            appendMessage('user', korean ? `${label} 선택` : `${label} selected`);
            list.querySelectorAll('button').forEach((item) => { item.disabled = true; });
            button.classList.add('is-selected');
            if (result.role === 'entity_reference' && result.resolution_key) {
              slots.entity_references[result.resolution_key] = candidate.entity_id;
            } else {
              selections[`${result.role}_entity_id`] = candidate.entity_id;
            }
            conversation.push({ role: 'user', content: selectionMessage });
            await requestAssistant(candidate.entity_id);
          });
          cards.appendChild(button);
        }
        list.appendChild(cards);
        messages.appendChild(list);
        scrollToLatest();
        setStatus(
          status,
          'idle',
          'Device selection required',
        );
        return;
      }

      if (resolution.status === 'failed') {
        awaitingClarification = false;
        appendMessage('assistant', result.message || '요청을 처리할 수 없습니다.');
        if (Array.isArray(result.missing_fields) && result.missing_fields.includes('automation_context')) {
          pendingAutomationCommand = activeCommand;
          if (recentDrafts.length > 1) renderRecentDraftPicker();
        }
        setStatus(status, 'idle', `${resolution.failure_reason || 'Request'} · Nothing executed`);
        return;
      }

      throw new Error(result.error || 'Draft generation failed.');
    } catch (error) {
      appendMessage('assistant', `The request could not be processed.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Assistant request failed · Nothing executed or saved');
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.disabled = false;
      providerSelect.disabled = !providerReady;
      input.focus();
    }
  };

  async function resumeSelectedAutomationCommand(command, context) {
    const operation = automationOperationFor(command, Boolean(context?.base_yaml));
    selectContext(context);
    activeAutomationOperation = operation;
    activeCommand = command;
    conversation = [{ role: 'user', content: command }];
    selections = {};
    slots = { entity_references: {} };
    awaitingClarification = false;

    await requestAssistant();
  }

  openButton.addEventListener('click', openPanel);
  closeButton.addEventListener('click', closePanel);
  backdrop?.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.classList.contains('hidden')) closePanel();
  });

  providerSelect.addEventListener('change', () => {
    if (busy || !providerSelect.value || providerSelect.value === selectedProvider) return;
    selectedProvider = providerSelect.value;
    resetConversationForProvider();
    setStatus(status, 'idle', 'Ready');
  });

  input.addEventListener('keydown', (event) => {
    // Keep multiline input available without making the common chat action
    // require a mouse click. IME composition must finish before Enter sends.
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!busy) form.requestSubmit();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !providerReady || !selectedProvider) return;
    const command = input.value.trim();
    if (!command) return;

    const mentionsRecentDraft = recentDrafts.some((draft) => {
      const title = String(draft.title || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      const request = String(command).normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
      return title.length >= 4 && request.includes(title);
    });
    const operation = automationOperationFor(command, Boolean(activeAutomationContext?.base_yaml) || mentionsRecentDraft);
    $('aiAssistantWelcome')?.remove();
    appendMessage('user', command);
    input.value = '';

    const context = contextForOperation(operation, command);
    activeAutomationOperation = operation;
    // Never reject a chat command purely in the browser.  With no selected
    // YAML the provider receives the request once and can return the explicit
    // automation_context_required plan; only then do we offer a draft picker.
    if (context) selectContext(context);
    if (awaitingClarification && conversation.length) {
      conversation.push({ role: 'user', content: command });
    } else {
      activeCommand = command;
      conversation = [{ role: 'user', content: command }];
      selections = {};
      slots = { entity_references: {} };
    }
    await requestAssistant();
  });
}
