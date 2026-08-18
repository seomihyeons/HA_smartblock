import { setModalOpenState } from '../utils/floating_modal_state';

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

export function initAiAssistantUI({ ws, renderAutomationToWorkspace, getWorkspaceYaml }) {
  const openButton = $('btnAiAssistant');
  const panel = $('aiAssistantPanel');
  const backdrop = $('aiAssistantBackdrop');
  const closeButton = $('aiAssistantClose');
  const form = $('aiAssistantForm');
  const input = $('aiAssistantInput');
  const sendButton = $('aiAssistantSend');
  const messages = $('aiAssistantMessages');
  const welcome = $('aiAssistantWelcome');
  const status = $('aiAssistantStatus');

  if (!openButton || !panel || !closeButton || !form || !input || !messages || !status) {
    return;
  }

  let activeCommand = '';
  let conversation = [];
  let selections = {};
  let awaitingClarification = false;
  let busy = false;

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

  const openPanel = () => {
    panel.classList.remove('hidden');
    setModalOpenState('aiAssistantPanel', true);
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
      appendMessage('assistant', 'The validated draft was imported into Blockly. It was not saved or executed.');
      setStatus(status, 'done', 'Imported to Blockly · Not saved to Home Assistant');
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
      card.appendChild(createElement(
        'div',
        'ai-draft-assumptions',
        `AI assumptions · ${assumptions.join(' · ')}`,
      ));
    }

    const validation = result.validation || {};
    const validationText = validation.schema_valid && validation.grounded && validation.blockly_supported
      ? '✓ Schema · ✓ Entity grounding · ✓ Blockly support'
      : 'Validation results are unavailable.';
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

  const requestDraft = async () => {
    busy = true;
    sendButton.disabled = true;
    input.disabled = true;
    setStatus(status, 'running', 'Home Assistant context loading · Automation draft planning...');

    try {
      const response = await fetch('/api/llm/automation/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: activeCommand,
          conversation,
          context_source: 'live_ha',
          selections,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Draft request failed: ${response.status}`);
      }

      if (result.status === 'success') {
        awaitingClarification = false;
        appendMessage('assistant', 'A validated draft was created from your live Home Assistant entities.');
        renderDraft(result);
        const provider = result.model || result.provider || 'unknown provider';
        const pipelineVersion = result.system?.pipeline_version
          ? ` · pipeline ${result.system.pipeline_version}`
          : '';
        setStatus(
          status,
          'done',
          `Validated draft · ${provider}${pipelineVersion} · ${result.context?.entity_count || 0} entities considered`,
        );
        selections = {};
        return;
      }

      if (result.status === 'needs_confirmation') {
        awaitingClarification = false;
        const question = result.question || 'Select the entity to use.';
        appendMessage('assistant', question);
        conversation.push({ role: 'assistant', content: question });
        const list = createElement('div', 'ai-candidate-list');
        for (const candidate of result.candidates || []) {
          const label = candidate.area
            ? `${candidate.name} · ${candidate.area}`
            : candidate.name || candidate.entity_id;
          const button = createElement('button', '', label);
          button.type = 'button';
          button.addEventListener('click', async () => {
            selections[`${result.role}_entity_id`] = candidate.entity_id;
            const selectionMessage = `Selected entity: ${candidate.entity_id}`;
            appendMessage('user', `${label} selected`);
            conversation.push({ role: 'user', content: selectionMessage });
            list.querySelectorAll('button').forEach((item) => { item.disabled = true; });
            await requestDraft();
          });
          list.appendChild(button);
        }
        messages.appendChild(list);
        scrollToLatest();
        setStatus(
          status,
          'idle',
          `Entity confirmation required · ${result.model || result.provider || 'provider unknown'}`,
        );
        return;
      }

      if (result.status === 'needs_clarification') {
        const questions = Array.isArray(result.questions) && result.questions.length
          ? result.questions
          : [result.question || 'Please provide a little more detail about the request.'];
        const question = questions[0];
        appendMessage('assistant', question);
        conversation.push({ role: 'assistant', content: question });
        awaitingClarification = true;
        setStatus(
          status,
          'idle',
          `Clarification required · ${result.model || result.provider || 'provider unknown'}`,
        );
        return;
      }

      if (result.status === 'unsupported') {
        awaitingClarification = false;
        appendMessage('assistant', result.reason || 'This request is outside the currently supported scope.');
        setStatus(status, 'idle', 'Unsupported request · Nothing executed');
        return;
      }

      throw new Error(result.error || 'Draft generation failed.');
    } catch (error) {
      appendMessage('assistant', `The request could not be processed.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Draft request failed · Check analyzer server and Home Assistant connection');
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.disabled = false;
      input.focus();
    }
  };

  openButton.addEventListener('click', openPanel);
  closeButton.addEventListener('click', closePanel);
  backdrop?.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.classList.contains('hidden')) closePanel();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const command = input.value.trim();
    if (!command) return;

    welcome?.remove();

    if (awaitingClarification && conversation.length) {
      conversation.push({ role: 'user', content: command });
    } else {
      activeCommand = command;
      conversation = [{ role: 'user', content: command }];
      selections = {};
    }
    appendMessage('user', command);
    input.value = '';
    await requestDraft();
  });
}
