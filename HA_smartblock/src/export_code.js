// src/export_code.js

/** 내부 유틸: 개행 보존하며 YAML 텍스트 가져오기 */
function getYamlText(outputId) {
  const el = document.getElementById(outputId);
  // <pre> 요소면 innerText가 가장 안전하게 줄바꿈을 보존합니다.
  return el ? el.innerText : '';
}

/** 내부 유틸: 파일명 안전화 */
function toSafeFilename(name, fallback = 'automation') {
  const base = (name || '').trim() || fallback;
  return base.replace(/[\\/:*?"<>|]/g, '_');
}

/** 내부 유틸: YAML의 alias 추출(따옴표 제거) */
function extractAliasForFilename(yaml) {
  const m = yaml.match(/^\s*-?\s*alias:\s*['"]?(.+?)['"]?\s*$/m);
  return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
}

/** 내부 유틸: 파일 다운로드 */
function downloadYamlFile(yaml, filename) {
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.yaml') ? filename : `${filename}.yaml`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * YAML 내보내기 / 복사 버튼을 outputId(예: 'generatedCode') 요소 바로 아래에 붙입니다.
 * ws(Blockly.Workspace)를 넘기면 변경 시에도 버튼이 항상 존재하도록 보장합니다.
 */
export function setupYamlExportButtons(outputId = 'generatedCode', ws = null) {
  function ensureExportButtons() {
    const host = document.getElementById(outputId);
    if (!host) return;

    // 이미 만들어졌으면 재생성하지 않음
    if (document.getElementById('yamlButtons')) return;

    const wrap = document.createElement('div');
    wrap.id = 'yamlButtons';
    wrap.style.marginTop = '8px';

    const exportBtn = document.createElement('button');
    exportBtn.id = 'exportYamlBtn';
    exportBtn.textContent = 'Export YAML';

    const copyBtn = document.createElement('button');
    copyBtn.id = 'copyYamlBtn';
    copyBtn.textContent = 'Copy YAML';
    copyBtn.style.marginLeft = '6px';

    wrap.appendChild(exportBtn);
    wrap.appendChild(copyBtn);
    host.parentNode.insertBefore(wrap, host.nextSibling);

    exportBtn.addEventListener('click', () => {
      const yaml = getYamlText(outputId);
      if (!yaml.trim()) {
        alert('내보낼 YAML이 없습니다.');
        return;
      }
      const alias = extractAliasForFilename(yaml);
      const filename = toSafeFilename(alias || 'automation');
      downloadYamlFile(yaml, filename);
    });

    copyBtn.addEventListener('click', async () => {
      const yaml = getYamlText(outputId);
      if (!yaml.trim()) {
        alert('복사할 YAML이 없습니다.');
        return;
      }
      try {
        await navigator.clipboard.writeText(yaml);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy YAML'), 1200);
      } catch (err) {
        console.error(err);
        alert('클립보드 복사에 실패했습니다.');
      }
    });
  }

  // 첫 로드 시 버튼 보장
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureExportButtons);
  } else {
    ensureExportButtons();
  }

  // 워크스페이스 변경 시에도 버튼 보장
  if (ws && typeof ws.addChangeListener === 'function') {
    ws.addChangeListener(() => ensureExportButtons());
  }
}
