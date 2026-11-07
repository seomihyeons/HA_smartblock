import './assistant.css';
import { setModalOpenState } from '../../utils/floating_modal_state';
import { yamlTextToInternalJson } from '../../import/yaml_import.js';
import { pushYamlToHomeAssistant } from '../push_automation.js';
import YAML from 'js-yaml';
import { runConflictAnalyzer } from '../conflict_analyzer/run_conflict_analyzer.js';
import { classifyConflictError } from '../conflict_analyzer/conflict_report_format.js';
import { dummyEntities } from '../../data/entities_index.js';

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

function displayValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '').trim();
}

function formatDelay(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim() || '(unspecified)';
  if (!value || typeof value !== 'object') return '(unspecified)';

  const hours = Number(value.hours ?? value.hour ?? 0);
  const minutes = Number(value.minutes ?? value.minute ?? 0);
  const seconds = Number(value.seconds ?? value.second ?? 0);
  if (![hours, minutes, seconds].every(Number.isFinite)) return '(unspecified)';
  return [hours, minutes, seconds]
    .map((part) => String(Math.max(0, Math.trunc(part))).padStart(2, '0'))
    .join(':');
}

// Show each Home Assistant trigger using its own native fields.
function describeTrigger(trigger = {}) {
  const kind = String(trigger?.trigger || trigger?.platform || '').trim();
  const value = displayValue;
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

function describeCondition(condition = {}) {
  const kind = String(condition?.condition || condition?.type || '').trim();
  const entityId = displayValue(condition?.entity_id);
  if (kind === 'state') return `State · ${entityId || '(unspecified)'} = ${displayValue(condition?.state) || '(unspecified)'}`;
  if (kind === 'numeric_state') {
    const limits = [
      condition?.above != null ? `above ${displayValue(condition.above)}` : '',
      condition?.below != null ? `below ${displayValue(condition.below)}` : '',
    ].filter(Boolean).join(' · ');
    return `Numeric state · ${entityId || '(unspecified)'}${limits ? ` · ${limits}` : ''}`;
  }
  if (kind === 'sun') {
    const limits = [
      condition?.after ? `after ${displayValue(condition.after)}` : '',
      condition?.before ? `before ${displayValue(condition.before)}` : '',
    ].filter(Boolean).join(' · ');
    return `Sun${limits ? ` · ${limits}` : ''}`;
  }
  if (kind === 'time') {
    const limits = [
      condition?.after ? `after ${displayValue(condition.after)}` : '',
      condition?.before ? `before ${displayValue(condition.before)}` : '',
      condition?.weekday ? `on ${displayValue(condition.weekday)}` : '',
    ].filter(Boolean).join(' · ');
    return `Time${limits ? ` · ${limits}` : ''}`;
  }
  if (kind === 'and' || kind === 'or' || kind === 'not') {
    const nested = Array.isArray(condition.conditions) ? condition.conditions.length : 0;
    return `${kind.toUpperCase()} · ${nested} nested condition${nested === 1 ? '' : 's'}`;
  }
  if (kind === 'template') return 'Template condition';
  return `${kind || 'Unknown condition'}${entityId ? ` · ${entityId}` : ''}`;
}

function describeAction(action = {}) {
  if (action?.delay != null) return `Delay · ${formatDelay(action.delay)}`;
  const service = actionName(action) || 'Unknown action';
  const targets = Array.isArray(action.target?.entity_id)
    ? action.target.entity_id.join(', ')
    : firstEntityId(action.target?.entity_id);
  return `${service}${targets ? ` · ${targets}` : ''}`;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalValue(value[key]);
    return result;
  }, {});
}

function sameAutomationItem(left, right) {
  return JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));
}

function itemIdentity(kind, item = {}) {
  const entityId = displayValue(item.entity_id || item.target?.entity_id || item.target?.device_id);
  if (kind === 'trigger') return [item.trigger || item.platform || '', entityId, item.event_type || ''].join('|');
  if (kind === 'condition') return [item.condition || item.type || '', entityId].join('|');
  if (kind === 'action') return [actionName(item) || (item.delay != null ? 'delay' : ''), entityId].join('|');
  return '';
}

function automationItems(automation, kind) {
  const plural = `${kind}s`;
  const value = automation?.[plural] ?? automation?.[kind] ?? [];
  return Array.isArray(value) ? value : [value].filter(Boolean);
}

function parseComparisonAutomation(yaml) {
  if (!yaml || typeof yaml !== 'string') return null;
  try {
    const parsed = YAML.load(yaml);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Only presentation is derived here: unchanged lines remain neutral, additions
// are green, and edits to an existing semantic item are blue. This does not
// affect the generated YAML, validation, or import behavior.
function draftRowChangeClass(kind, item, baseline) {
  if (!baseline) return '';
  const prior = automationItems(baseline, kind);
  if (prior.some((previous) => sameAutomationItem(previous, item))) return '';
  const identity = itemIdentity(kind, item);
  if (identity && prior.some((previous) => itemIdentity(kind, previous) === identity)) {
    return 'ai-draft-row-changed';
  }
  return 'ai-draft-row-added';
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

function entityRecord(entityId) {
  return (dummyEntities || []).find((entity) => entity?.entity_id === entityId) || null;
}

function friendlyEntityName(entityId) {
  const id = String(entityId || '').trim();
  const entity = entityRecord(id);
  return String(entity?.attributes?.friendly_name || entity?.friendly_name || entity?.name || id || 'Unknown entity');
}

function readableState(entityId, value) {
  const state = String(value || '').trim();
  const deviceClass = String(entityRecord(entityId)?.attributes?.device_class || '').toLowerCase();
  if (deviceClass === 'motion') return state === 'on' ? 'detected' : state === 'off' ? 'cleared' : state;
  if (deviceClass === 'door') return state === 'on' ? 'open' : state === 'off' ? 'closed' : state;
  return state || 'a new state';
}

function describeConflictTrigger(trigger = {}) {
  const platform = String(trigger?.platform || '').trim();
  const entityId = String(trigger?.entity_id || '').trim();
  if (platform === 'state' && entityId) {
    return `${friendlyEntityName(entityId)} changes to ${readableState(entityId, trigger?.to)}`;
  }
  if (platform.startsWith('event:')) return `Event ${platform.slice('event:'.length)}`;
  return platform || 'Unknown trigger';
}

function describeConflictAction(action = {}) {
  const service = String(action?.service || '').trim();
  const entityId = String(action?.entity_id || '').trim();
  const verb = {
    turn_on: 'Turn on', turn_off: 'Turn off', lock: 'Lock', unlock: 'Unlock',
    open_cover: 'Open', close_cover: 'Close', open_valve: 'Open', close_valve: 'Close',
    play: 'Play', stop: 'Stop', pause: 'Pause', mute: 'Mute', unmute: 'Unmute',
  }[service.split('.').pop()] || service.split('.').pop()?.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase()) || 'Run';
  return entityId ? `${verb} ${friendlyEntityName(entityId)}` : verb;
}

function conflictAutomationLabel(action = {}) {
  const source = action?.automation || {};
  return String(source.alias || source.id || 'Unknown automation');
}

function allConflictIssues(report = {}) {
  return [
    ...(Array.isArray(report?.redundancy) ? report.redundancy : []),
    ...(Array.isArray(report?.inconsistency) ? report.inconsistency : []),
    ...(Array.isArray(report?.circularity) ? report.circularity : []),
  ];
}

function describeCycleNode(node = {}) {
  if (node?.kind === 'trigger') return describeConflictTrigger(node.trigger);
  if (node?.kind === 'action') return describeConflictAction(node.action);
  return 'Unknown step';
}

function conflictIssuePresentation(issue = {}) {
  const type = String(issue?.issue_code || '');
  if (type === 'duplicate_action_path') {
    const action = issue?.action || {};
    const automations = Array.isArray(issue?.automations) ? issue.automations : [];
    const labels = automations.map((automation) => String(automation?.alias || automation?.id || '')).filter(Boolean);
    return {
      title: 'Duplicate action path',
      automations: labels.length ? `Automations: ${labels.join(' ↔ ')}` : `Automation: ${conflictAutomationLabel(action)}`,
      rows: [
        ['Trigger', describeConflictTrigger(issue?.trigger)],
        ['Action', describeConflictAction(action)],
        ['Paths', `${Number(issue?.paths_count || 0)} execution paths`],
      ],
      description: `${describeConflictAction(action)} can be reached through multiple paths after ${describeConflictTrigger(issue?.trigger)}.`,
    };
  }
  if (type === 'circular_automation_flow') {
    const automations = Array.isArray(issue?.automations) ? issue.automations : [];
    const labels = automations.map((automation) => String(automation?.alias || automation?.id || '')).filter(Boolean);
    const cycle = (Array.isArray(issue?.cycle) ? issue.cycle : []).map(describeCycleNode).join(' → ');
    return {
      title: 'Circular automation flow',
      automations: labels.length ? `Automations: ${labels.join(' ↔ ')}` : '',
      rows: [['Cycle', cycle || 'A state change can trigger the flow again']],
      description: 'This automation flow can feed back into one of its own triggers and repeat.',
    };
  }
  const action1 = issue?.action_1 || {};
  const action2 = issue?.action_2 || {};
  const trigger = issue?.trigger || {};
  const entityId = String(issue?.entity_id || action1.entity_id || action2.entity_id || '').trim();
  return {
    title: 'Inconsistent device actions',
    automations: `Automations: ${conflictAutomationLabel(action1)} ↔ ${conflictAutomationLabel(action2)}`,
    rows: [
      ['Trigger', describeConflictTrigger(trigger)],
      ['Action 1', describeConflictAction(action1)],
      ['Action 2', describeConflictAction(action2)],
      ['Entity', friendlyEntityName(entityId)],
    ],
    description: `${describeConflictAction(action1)} and ${describeConflictAction(action2)} may produce incompatible results for ${friendlyEntityName(entityId)} following ${describeConflictTrigger(trigger)}.`,
  };
}

function createConflictChatCard(report) {
  const issues = allConflictIssues(report);
  const count = Number(report?.summary?.total_issues ?? issues.length) || 0;
  const existingCount = report?.analysis_scope?.existing_count ?? report?.summary?.automations ?? 0;
  const card = createElement('section', `ai-conflict-card ${count ? 'ai-conflict-card-warning' : 'ai-conflict-card-clear'}`);

  if (!count) {
    card.appendChild(createElement('div', 'ai-conflict-title', 'No conflicts found'));
    card.appendChild(createElement(
      'div',
      'ai-conflict-summary',
      `No conflicts found with ${existingCount} active Home Assistant automations.`,
    ));
    return card;
  }

  card.appendChild(createElement(
    'div',
    'ai-conflict-title',
    `${count} potential conflict${count === 1 ? '' : 's'} found`,
  ));
  card.appendChild(createElement(
    'div',
    'ai-conflict-summary',
    `Compared with ${existingCount} active Home Assistant automations`,
  ));

  issues.forEach((issue, index) => {
    const presentation = conflictIssuePresentation(issue);
    const issueCard = createElement('section', 'ai-conflict-issue-card');
    issueCard.appendChild(createElement('div', 'ai-conflict-issue-title', `Issue ${index + 1} · ${presentation.title}`));
    if (presentation.automations) issueCard.appendChild(createElement('div', 'ai-conflict-automations', presentation.automations));
    presentation.rows.forEach(([label, value]) => {
      const row = createElement('div', 'ai-conflict-row');
      row.append(createElement('span', 'ai-conflict-key', label), createElement('span', 'ai-conflict-value', value));
      issueCard.appendChild(row);
    });
    issueCard.appendChild(createElement(
      'div',
      'ai-conflict-description',
      presentation.description,
    ));
    card.appendChild(issueCard);
  });
  return card;
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
    // Editing context remains in activeAutomationContext for follow-up
    // requests, but is intentionally not shown as a persistent chat banner.
  }

  const renderWelcome = () => {
    messages.textContent = '';
    const section = createElement('section', 'ai-assistant-welcome');
    section.id = 'aiAssistantWelcome';
    section.appendChild(createElement('h2', '', 'How can I help?'));
    section.appendChild(createElement(
      'p',
      '',
      'Describe what you want to automate or control, or ask about your Home Assistant. Automation drafts can be reviewed and refined as blocks before you save them.',
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

  // Both card actions must consume the same normalized output produced by
  // importing this exact AI draft into native Blockly and exporting its scope.
  // Never send the original LLM YAML or a stale/unrelated workspace export.
  const importAndExportDraft = async (automation, button, artifact) => {
    if (!await importDraft(automation, button, artifact)) return null;
    const yaml = typeof getWorkspaceYaml === 'function'
      ? String(getWorkspaceYaml() || '').trim() : '';
    if (!yaml) {
      appendMessage('assistant', 'Blockly export failed after importing the draft.', 'ai-message-error');
      setStatus(status, 'error', 'Blockly export failed');
      return null;
    }
    return yaml;
  };

  const pushDraft = async (automation, artifact, button) => {
    const exportedYaml = await importAndExportDraft(automation, button, artifact);
    if (!exportedYaml) return;

    // Check the exported YAML itself, not the model's original draft, before
    // deciding whether to create or overwrite a Home Assistant automation.
    let exportedAutomation;
    try {
      const document = YAML.load(exportedYaml, { schema: YAML.JSON_SCHEMA });
      exportedAutomation = Array.isArray(document)
        ? (document.length === 1 ? document[0] : null) : document;
      if (!exportedAutomation || typeof exportedAutomation !== 'object'
        || Array.isArray(exportedAutomation)) {
        throw new Error('Expected exactly one exported Blockly automation.');
      }
    } catch (error) {
      appendMessage('assistant', `Could not read exported Blockly YAML.\n${error?.message || error}`, 'ai-message-error');
      setStatus(status, 'error', 'Blockly export failed');
      return;
    }

    const existingId = String(artifact?.automation_id || '').trim();
    const declaredId = String(exportedAutomation.id || '').trim();
    if (existingId && declaredId && declaredId !== existingId) {
      setStatus(status, 'error', 'Automation ID mismatch');
      appendMessage('assistant',
        'The exported Blockly YAML has a different automation ID from the selected Home Assistant automation. Nothing was saved.',
        'ai-message-error');
      return;
    }
    const title = String(exportedAutomation.alias || artifact?.title || 'this automation');
    const question = existingId
      ? `Update "${title}" in Home Assistant?\n\nThis will overwrite automation ID: ${existingId}.\nThe content comes from the imported Blockly YAML.`
      : declaredId
        ? `Push "${title}" to Home Assistant using automation ID ${declaredId}?\n\nIf that ID exists, it may be overwritten. The content comes from the imported Blockly YAML.`
        : `Save "${title}" as a new Home Assistant automation?\n\nThe content comes from the imported Blockly YAML.`;
    if (!window.confirm(question)) return;

    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = 'Pushing...';
    try {
      const saved = await pushYamlToHomeAssistant(
        exportedYaml, existingId ? { id: existingId } : {},
      );
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
    const triggers = automationItems(automation, 'trigger');
    const conditionsList = automationItems(automation, 'condition');
    const actionsList = automationItems(automation, 'action');
    const card = createElement('section', 'ai-draft-card');
    const isModification = result.operation === 'modify';
    const baseline = isModification ? parseComparisonAutomation(result.comparison_base_yaml) : null;
    card.appendChild(createElement('div', 'ai-draft-title', isModification
      ? `Proposed update · ${automation.alias || 'Automation'}`
      : automation.alias || 'Automation draft'));
    if (!triggers.length) {
      card.appendChild(createElement('div', 'ai-draft-row', 'Trigger · Not specified'));
    }
    triggers.forEach((trigger, index) => {
      const label = triggers.length === 1 ? 'Trigger' : `Trigger ${index + 1}`;
      card.appendChild(createElement(
        'div',
        `ai-draft-row ${draftRowChangeClass('trigger', trigger, baseline)}`.trim(),
        `${label} · ${describeTrigger(trigger)}`,
      ));
    });
    conditionsList.forEach((condition, index) => {
      card.appendChild(createElement(
        'div',
        `ai-draft-row ${draftRowChangeClass('condition', condition, baseline)}`.trim(),
        `Condition ${index + 1} · ${describeCondition(condition)}`,
      ));
    });
    actionsList.forEach((action, index) => {
      card.appendChild(createElement(
        'div',
        `ai-draft-row ${draftRowChangeClass('action', action, baseline)}`.trim(),
        `Action ${index + 1} · ${describeAction(action)}`,
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
      const draftYaml = await importAndExportDraft(automation, analyzeButton, artifact);
      if (!draftYaml) return;
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
        messages.appendChild(createConflictChatCard(report));
        scrollToLatest();
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
    pushButton.addEventListener('click', () => pushDraft(automation, artifact, pushButton));
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
    const comparisonBaseYaml = activeAutomationContext?.base_yaml || '';
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
          renderDraft({
            ...payload,
            operation: payload.operation || activeAutomationOperation,
            comparison_base_yaml: comparisonBaseYaml,
          }, artifact);
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
        // Grounding failures are expected, safe host outcomes. Keep their
        // structured validation data on the response for diagnostics, but do
        // not expose internal parser/validator paths in the conversational UI.
        const showValidationDetails = !['entity_not_found', 'unsupported_capability'].includes(
          String(resolution.failure_reason || ''),
        );
        const details = showValidationDetails && Array.isArray(result.validation?.errors)
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
