const AUTOMATION_SIGNAL_RE = /(?:\bwhen(?:ever)?\b|\bif\b|\bafter\b|\bbefore\b|\bevery\b|\bat\s+\d|\bschedule\b|\bautomat(?:e|ion)\b|자동화|규칙|예약|매일|되면|할\s*때|감지.*(?:면|때))/iu;
const LIGHT_SIGNAL_RE = /(?:\blights?\b|\blamps?\b|조명|전등|램프|불)/iu;
const TURN_ON_SIGNAL_RE = /(?:\bturn\s+on\b|\bswitch\s+on\b|\blights?\s+on\b|켜\s*(?:줘|주세요|줘요|라)?)/iu;
const TURN_OFF_SIGNAL_RE = /(?:\bturn\s+off\b|\bswitch\s+off\b|\blights?\s+off\b|꺼\s*(?:줘|주세요|줘요|라)?|끄\s*(?:어|어줘|세요|어주세요)?)/iu;

export function classifyAssistantRequest(command) {
  const text = String(command || "").normalize("NFKC").trim();
  if (!text || AUTOMATION_SIGNAL_RE.test(text)) return "automation";

  const turnOn = TURN_ON_SIGNAL_RE.test(text);
  const turnOff = TURN_OFF_SIGNAL_RE.test(text);
  if (LIGHT_SIGNAL_RE.test(text) && turnOn !== turnOff) return "immediate_control";

  // The automation path owns abstract goals and can safely clarify or reject them.
  return "automation";
}

export function createAssistantRequestRouter({ createDraft, previewControl }) {
  if (typeof createDraft !== "function" || typeof previewControl !== "function") {
    throw new TypeError("Assistant router requires draft and control handlers");
  }

  return {
    async handle(payload = {}) {
      const intent = classifyAssistantRequest(payload.command);
      if (intent === "immediate_control") {
        return {
          intent,
          ...await previewControl({
            command: payload.command,
            selected_entity_id: payload.selected_entity_id,
          }),
        };
      }
      return {
        intent,
        ...await createDraft(payload),
      };
    },
  };
}
