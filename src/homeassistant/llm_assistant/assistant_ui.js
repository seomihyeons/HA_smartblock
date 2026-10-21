import './assistant.css';
import { setModalOpenState } from '../../utils/floating_modal_state.js';

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

export function initAiAssistantUI({ ws, renderAutomationToWorkspace, getWorkspaceYaml }) {
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

  const renderWelcome = () => {
    messages.textContent = '';
    const section = createElement('section', 'ai-assistant-welcome');
    section.id = 'aiAssistantWelcome';
    section.appendChild(createElement('h2', '', 'Ask HA-SmartBlock'));
    section.appendChild(createElement(
      'p',
      '',
      'Describe an automation or request a supported device action. Device commands require an explicit Execute confirmation; automation saving still requires Push to HA.',
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
      'Requests are routed automatically · Device control always requires Execute · Automation saving still requires Push to HA',
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
    renderWelcome();
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

  const importDraft = (automation, button) => {
    const hasBlocks = typeof ws?.getAllBlocks === 'function' && ws.getAllBlocks(false).length > 0;
    if (hasBlocks) {
      const accepted = window.confirm('Replace the current workspace with this automation draft?');
      if (!accepted) return false;
    }

    try {
      button.disabled = true;
      renderAutomationToWorkspace(ws, automation, { clearBefore: true });
      appendMessage('assistant', 'The validated draft was imported and its YAML regenerated. Use Push to HA separately to save it.');
      setStatus(status, 'done', 'Imported to Blockly · YAML regenerated · Not saved to Home Assistant');
      return true;
    } catch (error) {
      button.disabled = false;
      appendMessage('assistant', `Blockly import failed.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Blockly import failed');
      return false;
    }
  };

  const renderDraft = (result) => {
    const automation = result.automation || {};
    const trigger = automation.triggers?.[0] || {};
    const hasTrigger = Array.isArray(automation.triggers) && automation.triggers.length > 0;
    const actionsList = Array.isArray(automation.actions) ? automation.actions : [];
    const card = createElement('section', 'ai-draft-card');
    card.appendChild(createElement('div', 'ai-draft-title', automation.alias || 'Automation draft'));
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
      : validation.roundtrip_verified ? '✓ Round-trip preserved · Includes Raw blocks' : 'Validation results are unavailable.';
    card.appendChild(createElement('div', 'ai-draft-validation', validationText));

    const actions = createElement('div', 'ai-draft-actions');
    const importButton = createElement('button', '', 'Import blocks');
    importButton.type = 'button';
    importButton.addEventListener('click', () => importDraft(automation, importButton));
    actions.appendChild(importButton);

    const analyzeButton = createElement('button', '', 'Import and analyze conflicts');
    analyzeButton.type = 'button';
    analyzeButton.addEventListener('click', () => {
      const imported = importDraft(automation, analyzeButton);
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

  const renderControlPreview = (preview) => {
    const card = createElement('section', 'ai-draft-card');
    card.appendChild(createElement('div', 'ai-draft-title', 'Device control preview'));
    card.appendChild(createElement('div', 'ai-draft-row', `Service: ${preview.service} · Risk: ${preview.risk}`));
    for (const entity of preview.entities || [preview.entity].filter(Boolean)) {
      card.appendChild(createElement('div', 'ai-draft-row', `${entity.display_name || entity.name || entity.entity_id} · ${entity.entity_id}`));
    }
    if (Object.keys(preview.data || {}).length) card.appendChild(createElement('pre', 'ai-draft-row', JSON.stringify(preview.data, null, 2)));
    card.appendChild(createElement('div', 'ai-draft-assumptions', 'Nothing has executed. This preview expires in 60 seconds and can be used once.'));
    const button = createElement('button', '', 'Execute');
    button.type = 'button';
    button.addEventListener('click', async () => {
      if (busy) return;
      busy = true; button.disabled = true; sendButton.disabled = true; input.disabled = true; providerSelect.disabled = true;
      try {
        const response = await fetch('/api/control-now/execute', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ execution_id: preview.execution_id, confirmed: true, command: activeCommand, response_language: responseLanguageFor(activeCommand), provider: selectedProvider }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Execution failed; create a new preview before retrying.');
        const control = result.result || {};
        if (control.target_count === 1 && control.entity?.entity_id) interactionContext = { last_confirmed_target: { entity_id: control.entity.entity_id, source: 'executed_control' } };
        appendMessage('assistant', result.message);
        setStatus(status, 'done', control.verification?.status === 'confirmed' ? 'Request accepted · Expected state observed' : 'Request accepted · State change not confirmed');
      } catch (error) {
        appendMessage('assistant', String(error.message), 'ai-message-error');
        setStatus(status, 'error', 'Execution outcome unconfirmed · Create a new preview before retrying');
      } finally {
        busy = false; sendButton.disabled = false; input.disabled = false; providerSelect.disabled = !providerReady;
      }
    });
    card.appendChild(button); messages.appendChild(card); scrollToLatest();
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
      if (resolution.status === 'needs_confirmation' && result.control_preview) {
        renderControlPreview(result.control_preview);
        setStatus(status, 'idle', 'Awaiting explicit Execute · Nothing executed');
        return;
      }
      if (resolution.status === 'needs_clarification') {
        awaitingClarification = true;
        appendMessage('assistant', result.message);
        conversation.push({ role: 'assistant', content: result.message });
        setStatus(status, 'idle', 'Clarification required');
        return;
      }
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
          renderDraft(payload);
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
        setStatus(status, 'idle', `${resolution.failure_reason || 'Request'} · Nothing executed`);
        return;
      }

      throw new Error(result.error || 'Draft generation failed.');
    } catch (error) {
      appendMessage('assistant', `The request could not be processed.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Planning failed · Nothing executed or saved');
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.disabled = false;
      providerSelect.disabled = !providerReady;
      input.focus();
    }
  };

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

    $('aiAssistantWelcome')?.remove();

    appendMessage('user', command);
    input.value = '';

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
