// src/utils/block_state_options.js
import * as Blockly from 'blockly';

/** 공통: ['on','off'] -> [['on','on'],['off','off'],['(any)','']] */
export function buildBaseOptions(values) {
  const opts = (values || []).map(v => [String(v), String(v)]);
  opts.push(['(any)', '']);
  return opts;
}


/** 공통: FROM과 같은 값은 TO에서 숨기기 (단, '(any)'는 항상 허용) */
export function filterToAgainstFrom(block, baseOptions) {
  const from = block?.getFieldValue('FROM') || '';
  return baseOptions.filter(([label, value]) => value !== from || value === '');
}

/** A안) 상태셋을 직접 주입하는 팩토리 */
export function makeToStateOptionsFor(values) {
  const base = buildBaseOptions(values);
  return function getToStateOptions() {
    const block = this.getSourceBlock?.();
    return filterToAgainstFrom(block, base);
  };
}

/** B안) ENTITY 필드의 도메인별 상태셋을 자동 선택 */
export function makeToStateOptionsForEntityField(entityFieldName, domainMap) {
  return function getToStateOptionsByEntity() {
    const block = this.getSourceBlock?.();
    const entityId = block?.getFieldValue(entityFieldName) || '';
    const domain = String(entityId).split('.')[0]; // 'lock.front_door' -> 'lock'
    const values = domainMap[domain] || domainMap._default || [];
    const base = buildBaseOptions(values);
    return filterToAgainstFrom(block, base);
  };
}

/** FROM/TO 동기화 확장: FROM과 TO가 같아지면 TO를 '(any)'로 바꿔줌 */
export function registerFromToSyncExtension(name = 'syncFromToGeneric') {
  Blockly.Extensions.register(name, function () {
    const fromField = this.getField('FROM');
    const toField = this.getField('TO');

    const ensureValidToValue = () => {
      const from = fromField?.getValue?.() ?? '';
      const to = toField?.getValue?.() ?? '';
      if (from && to && from === to) {
        toField.setValue(''); // '(any)'
      }
    };

    fromField?.setValidator?.((newValue) => {
      setTimeout(ensureValidToValue, 0);
      return newValue;
    });
    setTimeout(ensureValidToValue, 0);
  });
}
