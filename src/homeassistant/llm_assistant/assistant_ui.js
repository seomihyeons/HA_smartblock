import './assistant.css';
import { setModalOpenState } from '../../utils/floating_modal_state';
import { yamlTextToInternalJson } from '../../import/yaml_import.js';
import { pushYamlToHomeAssistant } from '../push_automation.js';
import { runConflictAnalyzer } from '../conflict_analyzer/run_conflict_analyzer.js';
import { formatConflictChatReport, classifyConflictError } from '../conflict_analyzer/conflict_report_format.js';

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

// Show each Home Assistant trigger using its own native fields.
function describeTrigger(trigger = {}) {
  const kind = String(trigger?.trigger || trigger?.platform || '').trim();
  const value = (item) => Array.isArray(item) ? item.join(', ') : String(item ?? '').trim();
  if (kind === 'time') return `Time · ${value(trigger.at) || '(unspecified)'}`;
  if (kind === 'event') {
    const goal = trigger.event_data?.goal_id ? ` · Goal: ${trigger.event_data.goal_id}` : '';
    return `Event: ${trigger.event_type || 'unknown'}${goal}`;
  }
  if (kind === 'state') return `State · ${value(trigger.entity_id) || '(unspecified)'} · ${value(trigger.from) || '*'} → ${value(trigger.to) || '*'}`;
  if (kind === 'numeric_state') return `Numeric state · ${value(trigger.entity_id) || '(unspecified)'}`;
  if (kind === 'sun') return `Sun · ${value(trigger.event) || '(unspecified)'}`;
  if (kind === 'time_pattern') return 'Time pattern';
  return kind ? `${kind} · ${value(trigger.entity_id || trigger.event_type || '')}`.trim() : 'Unknown';
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
  // Chat messages are retained within one assistant session. The separate
  // confirmed target is authoritative for execution; conversation prose isn't.
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
    if (role === 'assistant' && typeof message === 'string' && message.trim()) {
      conversation.push({ role: 'assistant', content: message });
      conversation = conversation.slice(-24);
    }
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
    const source = context.source === 'recent_draft'
      ? 'recent draft'
      : context.source === 'home_assistant'
        ? 'Home Assistant'
        : 'current Blockly workspace';
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
      'Describe a smart-home goal, create an automation, or request a supported device action. Goal-based automation drafts can be reviewed as blocks; saving still requires Push to HA.',
    ));
    const example = createElement('div', 'ai-welcome-example');
    example.appendChild(createElement('span', '', 'Examples'));
    example.appendChild(createElement(
      'code',
      '',
      'Prepare for sleep. · When entrance motion is detected, turn on the living room light. · Turn on the coffee maker.',
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
        setStatus(status, 'error', 'LLM provider unavailable');
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
      const allBlocks = typeof ws?.getAllBlocks === 'function' ? ws.getAllBlocks(false) : [];
      const rawBlocks = allBlocks.filter((block) => /raw/i.test(String(block.type || '')));
      if (artifact) {
        artifact.import_report = { native_blockly: rawBlocks.length === 0, raw_block_count: rawBlocks.length };
        artifact.imported_to_blockly = true;
        artifact.base_yaml = typeof getWorkspaceYaml === 'function' ? String(getWorkspaceYaml() || artifact.base_yaml || '') : artifact.base_yaml;
        selectContext(artifact);
      } else {
        selectContext(workspaceContext());
      }
      // Importing is a local workspace action. Keep the chat history focused
      // on the user's requests and the generated draft, not status narration.
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

  const pushDraft = async (artifact, button) => {
    // Push this card's validated draft, never an unrelated Blockly workspace.
    // Manual edits to imported blocks can be saved with the main editor's
    // existing "Push to HA" action instead.
    const draftYaml = String(artifact?.draft_yaml || '').trim();
    if (!draftYaml) {
      setStatus(status, 'error', 'Draft unavailable');
      return;
    }
    const existingId = String(artifact.automation_id || '').trim();
    const declaredId = String(artifact.automation?.id || '').trim();
    if (existingId && declaredId && declaredId !== existingId) {
      setStatus(status, 'error', 'Automation ID mismatch');
      appendMessage('assistant', 'This draft has a different automation ID from the selected Home Assistant automation. Nothing was saved.', 'ai-message-error');
      return;
    }
    const title = String(artifact.title || 'this automation');
    const question = existingId
      ? `Update "${title}" in Home Assistant?\n\nThis will overwrite automation ID: ${existingId}.`
      : declaredId
        ? `Push "${title}" to Home Assistant using automation ID ${declaredId}?\n\nIf that ID exists, its configuration may be overwritten. This saves the draft, not later manual Blockly changes.`
        : `Save "${title}" as a new Home Assistant automation?\n\nThis saves the proposed draft, not later manual changes to Blockly blocks.`;
    if (!window.confirm(question)) return;

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Pushing...';
    try {
      const saved = await pushYamlToHomeAssistant(draftYaml, existingId ? { id: existingId } : {});
      artifact.automation_id = saved.id;
      artifact.saved_to_ha = true;
      button.textContent = 'Pushed to Home Assistant';
      setStatus(status, 'done', 'Saved to Home Assistant');
    } catch (error) {
      console.error('[HA-SmartBlock] Automation push failed:', error);
      button.textContent = originalLabel;
      setStatus(status, 'error', 'Push failed');
      appendMessage('assistant', `Failed to push to Home Assistant.\n${error?.message || error}`, 'ai-message-error');
    } finally {
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
        ? `Trigger · ${describeTrigger(trigger)}`
        : 'Trigger · Not specified',
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
    const validationStatus = (key) => validation[key] === true ? '✓' : validation[key] === false ? '○' : '…';
    const validationText = [
      `${validationStatus('schema_valid')} Schema`,
      `${validationStatus('grounded')} Grounding`,
      `${validationStatus('capability_valid')} Capability`,
      `${validationStatus('blockly_supported')} Native Blockly`,
      `${validationStatus('roundtrip_verified')} Round-trip`,
    ].join(' · ');
    card.appendChild(createElement('div', 'ai-draft-validation', validationText));

    const actions = createElement('div', 'ai-draft-actions');
    const importButton = createElement('button', '', isModification ? 'Apply changes' : 'Import blocks');
    importButton.type = 'button';
    importButton.addEventListener('click', async () => importDraft(automation, importButton, artifact));
    actions.appendChild(importButton);

    const analyzeButton = createElement('button', '', 'Import and analyze conflicts');
    analyzeButton.type = 'button';
    analyzeButton.addEventListener('click', async () => {
      // Reuse the existing analyzer endpoint without opening its separate
      // modal. The draft is imported first, exactly as this button promises.
      const imported = await importDraft(automation, analyzeButton, artifact);
      if (!imported) return;
      const draftYaml = typeof getWorkspaceYaml === 'function'
        ? String(getWorkspaceYaml() || '').trim() : '';
      if (!draftYaml) {
        appendMessage('assistant', 'Conflict analysis failed: Blockly did not export the imported draft.', 'ai-message-error');
        setStatus(status, 'error', 'Conflict analysis failed');
        return;
      }
      analyzeButton.disabled = true;
      const previousLabel = analyzeButton.textContent;
      analyzeButton.textContent = 'Analyzing...';
      setStatus(status, 'running', 'Analyzing conflicts...');
      const started = performance.now();
      try {
        const report = await runConflictAnalyzer({
          onlyEnabled: true,
          concurrency: 8,
          draftYaml,
          automationId: artifact?.automation_id || result.base_context?.automation_id || null,
        });
        if (!report || typeof report.summary !== 'object'
          || report.analysis_scope?.draft_count !== 1) {
          throw new Error('The analyzer did not confirm that the imported draft was included.');
        }
        appendMessage('assistant', formatConflictChatReport(report, Math.round(performance.now() - started)));
        setStatus(status, 'done', 'Analysis complete');
      } catch (error) {
        appendMessage('assistant', classifyConflictError(error), 'ai-message-error');
        setStatus(status, 'error', 'Conflict analysis failed');
      } finally {
        analyzeButton.disabled = false;
        analyzeButton.textContent = previousLabel;
      }
    });
    actions.appendChild(analyzeButton);

    const pushButton = createElement('button', 'ai-draft-push-button', 'Push to Home Assistant');
    pushButton.type = 'button';
    pushButton.addEventListener('click', () => pushDraft(artifact, pushButton));
    actions.appendChild(pushButton);
    card.appendChild(actions);
    messages.appendChild(card);
    scrollToLatest();
  };

  const requestAssistant = async (selectedEntityId = null) => {
    busy = true;
    sendButton.disabled = true;
    input.disabled = true;
    setStatus(status, 'running', 'Processing...');
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
          automation_operation: activeAutomationOperation,
          // The selected full YAML stays at the trusted Node boundary; the
          // first LLM receives only a catalog summary and decides the intent.
          automation_context: activeAutomationContext?.base_yaml ? {
            operation: ['inspect', 'explain'].includes(activeAutomationOperation) ? activeAutomationOperation : 'modify',
            source: activeAutomationContext.source,
            title: activeAutomationContext.title,
            draft_id: activeAutomationContext.draft_id || null,
            automation_id: activeAutomationContext.automation_id || null,
            enabled: activeAutomationContext.enabled !== false,
            base_yaml: activeAutomationContext.base_yaml,
          } : undefined,
          recent_automations: recentDrafts.map((draft) => ({
            source: 'recent_draft',
            title: draft.title,
            draft_id: draft.draft_id,
            automation_id: draft.automation_id || null,
            enabled: draft.enabled !== false,
            base_yaml: draft.base_yaml,
          })),
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
        // Preserve the host-validated failure reason for debugging bad plans.
        const details = [
          result.error,
          ...(Array.isArray(result.validation?.errors) ? result.validation.errors : []),
        ].filter((item) => typeof item === 'string' && item.trim());
        const reason = [...new Set(details)].slice(0, 3).join('\n');
        throw new Error([result.message || 'Assistant plan validation failed.', reason].filter(Boolean).join('\n'));
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
          appendMessage('assistant', result.message || payload.answer || 'Current Home Assistant information was retrieved.');
          setStatus(status, 'done', 'State retrieved');
          return;
        }
        if (payload.kind === 'automation_readonly') {
          appendMessage('assistant', result.message || payload.summary || 'Automation reviewed without making changes.');
          setStatus(status, 'done', 'Automation reviewed');
          return;
        }
        if (payload.kind === 'automation') {
          appendMessage('assistant', result.message || 'A validated automation draft was created.');
          const artifact = {
            draft_id: `draft-${Date.now()}-${++draftSequence}`,
            source: 'recent_draft',
            title: titleForAutomation(payload.automation),
            base_yaml: String(payload.normalized_yaml || payload.yaml || ''),
            draft_yaml: String(payload.normalized_yaml || payload.yaml || ''),
            automation: payload.automation,
            enabled: payload.base_context?.enabled !== false,
            automation_id: payload.base_context?.automation_id || null,
            imported_to_blockly: false,
            created_at: Date.now(),
          };
          recentDrafts = [artifact, ...recentDrafts].slice(0, 12);
          selectContext(artifact);
          renderDraft({ ...payload, operation: payload.operation || activeAutomationOperation }, artifact);
          setStatus(status, 'done', 'Draft ready');
          selections = {};
          return;
        }
        appendMessage('assistant', result.message || 'The request was processed.');
        setStatus(status, 'done', 'Completed');
        return;
      }

      if (resolution.status === 'ambiguous') {
        awaitingClarification = false;
        const question = result.message || 'Select the entity to use.';
        appendMessage('assistant', question);
        const korean = responseLanguageFor(activeCommand) === 'ko';
        if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
          setStatus(status, 'idle', 'Clarification needed');
          return;
        }
        const list = createElement('section', 'ai-candidate-list');
        const cards = createElement('div', 'ai-candidate-cards');
        for (const candidate of result.candidates || []) {
          const displayName = candidate.title || candidate.display_name || candidate.name || candidate.entity_id;
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
            const isAutomation = result.role === 'automation_reference';
            const selectionMessage = isAutomation
              ? `Selected automation: ${candidate.title || candidate.display_name || candidate.automation_id}`
              : `Selected entity: ${candidate.entity_id}`;
            appendMessage('user', korean ? `${label} 선택` : `${label} selected`);
            list.querySelectorAll('button').forEach((item) => { item.disabled = true; });
            button.classList.add('is-selected');
            if (isAutomation) {
              const context = {
                source: ['home_assistant', 'recent_draft', 'workspace'].includes(candidate.source)
                  ? candidate.source : 'home_assistant',
                title: String(candidate.title || candidate.display_name || candidate.automation_id || 'Selected automation'),
                automation_id: candidate.automation_id || null,
                draft_id: candidate.draft_id || null,
                enabled: candidate.enabled !== false,
                base_yaml: String(candidate.base_yaml || ''),
              };
              if (!context.base_yaml) {
                appendMessage('assistant', 'The selected automation configuration is unavailable.');
                return;
              }
              selectContext(context);
              activeAutomationOperation = 'modify';
              conversation.push({ role: 'user', content: selectionMessage });
              await requestAssistant();
              return;
            }
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
          'Selection required',
        );
        return;
      }

      if (resolution.status === 'failed') {
        awaitingClarification = false;
        const details = Array.isArray(result.validation?.errors)
          ? [...new Set(result.validation.errors.filter((item) => typeof item === 'string' && item.trim()))].slice(0, 3)
          : [];
        appendMessage('assistant', [result.message || 'The request could not be processed.', ...details].join('\n'));
        if (Array.isArray(result.missing_fields) && result.missing_fields.includes('automation_context')) {
          pendingAutomationCommand = activeCommand;
          if (recentDrafts.length > 1) renderRecentDraftPicker();
        }
        setStatus(status, 'idle', 'Request not completed');
        return;
      }

      throw new Error(result.error || 'Draft generation failed.');
    } catch (error) {
      appendMessage('assistant', `The request could not be processed.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Request failed');
    } finally {
      busy = false;
      sendButton.disabled = false;
      input.disabled = false;
      providerSelect.disabled = !providerReady;
      input.focus();
    }
  };

  async function resumeSelectedAutomationCommand(command, context) {
    // The model, not browser regexes, selects the requested operation.
    const operation = 'auto';
    selectContext(context);
    activeAutomationOperation = operation;
    activeCommand = command;
    // Keep the existing chat history while the user picks an automation.
    // The original request is already present in the conversation.
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

    // Context selection is a UI hint. The first LLM decides the intent.
    const operation = 'auto';
    $('aiAssistantWelcome')?.remove();
    appendMessage('user', command);
    input.value = '';

    const context = contextForOperation(operation, command);
    activeAutomationOperation = operation;
    // Never reject a chat command purely in the browser.  With no selected
    // YAML the provider receives the request once and can return the explicit
    // automation_context_required plan; only then do we offer a draft picker.
    if (context) selectContext(context);
    // Each submitted turn has its own command, while prior turns remain
    // available to the planner. Provider changes still start a fresh chat.
    activeCommand = command;
    conversation.push({ role: 'user', content: command });
    conversation = conversation.slice(-24);
    if (!awaitingClarification) {
      selections = {};
      slots = { entity_references: {} };
    }
    await requestAssistant();
  });
}
