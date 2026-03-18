export function statusFromResult(result, rawCount) {
  if (!result.semanticEqual) return 'FAIL';
  if (rawCount > 0) return 'PASS_WITH_RAW';
  if (!result.strictEqual) return 'PASS_WITH_NORMALIZATION';
  return 'PASS';
}

export function formatOneReport({ name, compareResult, rawInfo }) {
  const rawCount = rawInfo.length;
  const status = statusFromResult(compareResult, rawCount);

  const lines = [];
  lines.push(`${name}: ${status}`);

  const o = compareResult.counts.original;
  const r = compareResult.counts.regenerated;
  lines.push(`- trigger ${r.triggers}개 / condition ${r.conditions}개 / action ${r.actions}개`);

  if (o.triggers !== r.triggers || o.conditions !== r.conditions || o.actions !== r.actions) {
    lines.push(
      `- count diff: trigger ${o.triggers}->${r.triggers}, ` +
      `condition ${o.conditions}->${r.conditions}, ` +
      `action ${o.actions}->${r.actions}`
    );
  }

  if (!rawCount) {
    lines.push('- RAW 없음');
  } else {
    lines.push(`- RAW ${rawCount}개`);
    rawInfo.forEach((x, idx) => {
      lines.push(`  ${idx + 1}. [${x.type}] ${x.head} (${x.class})`);
    });
  }

  return lines.join('\n');
}
