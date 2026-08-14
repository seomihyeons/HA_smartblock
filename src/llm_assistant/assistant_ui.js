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
  const closeButton = $('aiAssistantClose');
  const form = $('aiAssistantForm');
  const input = $('aiAssistantInput');
  const sendButton = $('aiAssistantSend');
  const messages = $('aiAssistantMessages');
  const status = $('aiAssistantStatus');

  if (!openButton || !panel || !closeButton || !form || !input || !messages || !status) {
    return;
  }

  let activeCommand = '';
  let selections = {};
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
      const accepted = window.confirm('현재 작업공간을 생성된 자동화 초안으로 교체할까요?');
      if (!accepted) return false;
    }

    try {
      button.disabled = true;
      renderAutomationToWorkspace(ws, automation, { clearBefore: true });
      appendMessage('assistant', '검증된 초안을 Blockly 작업공간에 가져왔습니다. 저장하거나 실행하지는 않았습니다.');
      setStatus(status, 'done', 'Imported to Blockly · Not saved to Home Assistant');
      return true;
    } catch (error) {
      button.disabled = false;
      appendMessage('assistant', `Blockly 가져오기에 실패했습니다.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Blockly import failed');
      return false;
    }
  };

  const renderDraft = (result) => {
    const automation = result.automation || {};
    const trigger = automation.triggers?.[0] || {};
    const action = automation.actions?.[0] || {};
    const card = createElement('section', 'ai-draft-card');
    card.appendChild(createElement('div', 'ai-draft-title', automation.alias || '자동화 초안'));
    card.appendChild(createElement(
      'div',
      'ai-draft-row',
      `Trigger · ${firstEntityId(trigger.entity_id)} · ${trigger.from || '*'} → ${trigger.to || '*'}`,
    ));
    card.appendChild(createElement(
      'div',
      'ai-draft-row',
      `Action · ${actionName(action)} · ${firstEntityId(action.target?.entity_id)}`,
    ));

    const validation = result.validation || {};
    const validationText = validation.schema_valid && validation.grounded && validation.blockly_supported
      ? '✓ Schema · ✓ Entity grounding · ✓ Blockly support'
      : '검증 결과를 확인할 수 없습니다.';
    card.appendChild(createElement('div', 'ai-draft-validation', validationText));

    const actions = createElement('div', 'ai-draft-actions');
    const importButton = createElement('button', '', '블록으로 가져오기');
    importButton.type = 'button';
    importButton.addEventListener('click', () => importDraft(automation, importButton));
    actions.appendChild(importButton);

    const analyzeButton = createElement('button', '', '가져오고 충돌 분석');
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
    setStatus(status, 'running', 'Home Assistant context loading · Fake provider planning...');

    try {
      const response = await fetch('/api/llm/automation/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: activeCommand,
          context_source: 'live_ha',
          selections,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `Draft request failed: ${response.status}`);
      }

      if (result.status === 'success') {
        appendMessage('assistant', '실제 Home Assistant entity에 근거한 자동화 초안을 만들었습니다.');
        renderDraft(result);
        setStatus(status, 'done', `Validated draft · ${result.context?.entity_count || 0} entities considered`);
        selections = {};
        return;
      }

      if (result.status === 'needs_confirmation') {
        appendMessage('assistant', result.question || '사용할 entity를 선택해 주세요.');
        const list = createElement('div', 'ai-candidate-list');
        for (const candidate of result.candidates || []) {
          const label = candidate.area
            ? `${candidate.name} · ${candidate.area}`
            : candidate.name || candidate.entity_id;
          const button = createElement('button', '', label);
          button.type = 'button';
          button.addEventListener('click', async () => {
            selections[`${result.role}_entity_id`] = candidate.entity_id;
            appendMessage('user', `${label} 선택`);
            list.querySelectorAll('button').forEach((item) => { item.disabled = true; });
            await requestDraft();
          });
          list.appendChild(button);
        }
        messages.appendChild(list);
        scrollToLatest();
        setStatus(status, 'idle', 'Entity confirmation required');
        return;
      }

      if (result.status === 'unsupported') {
        appendMessage('assistant', result.reason || '현재 지원 범위에서 처리할 수 없는 요청입니다.');
        setStatus(status, 'idle', 'Unsupported request · Nothing executed');
        return;
      }

      throw new Error(result.error || 'Draft generation failed.');
    } catch (error) {
      appendMessage('assistant', `요청 처리에 실패했습니다.\n${error?.message || error}`, 'ai-message-error');
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.classList.contains('hidden')) closePanel();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const command = input.value.trim();
    if (!command) return;

    activeCommand = command;
    selections = {};
    appendMessage('user', command);
    input.value = '';
    await requestDraft();
  });
}
