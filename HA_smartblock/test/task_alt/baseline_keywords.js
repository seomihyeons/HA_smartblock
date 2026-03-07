export const TASK_ALT_KEYWORDS = [
  '3d_printer',
  'alarm',
  'bedtime',
  'blinds',
  'bug_zapper',
  'camera',
  'christmas',
  'climate',
  'doors',
  'energy',
  'fans',
  'fountain',
  'garage',
  'holiday',
  'ios_actions',
  'laundry',
  'led_clock',
  'lights',
  'location',
  'locks',
  'media',
  'motion',
  'network',
  'occupancy',
  'roomba',
  'system',
  'vacation',
  'water_works',
  'weather',
];

const KEYWORDS_BY_LENGTH = [...TASK_ALT_KEYWORDS].sort((a, b) => b.length - a.length);

const KEYWORD_ALIASES = {
  fan: 'fans',
  door: 'doors',
  blind: 'blinds',
  light: 'lights',
  lock: 'locks',
  ios: 'ios_actions',
  ios_action: 'ios_actions',
};

export function detectTaskAltKeyword(fileName) {
  const base = String(fileName || '').replace(/\.(yaml|yml)$/i, '');
  const noIndex = base.replace(/^\d+_/, '').toLowerCase();

  const tokens = noIndex.split('_');
  const firstTwo = tokens.slice(0, 2).join('_');
  const firstToken = tokens[0];
  if (KEYWORD_ALIASES[firstTwo]) return KEYWORD_ALIASES[firstTwo];
  if (KEYWORD_ALIASES[firstToken]) return KEYWORD_ALIASES[firstToken];
  if (TASK_ALT_KEYWORDS.includes(firstToken)) return firstToken;

  for (const keyword of KEYWORDS_BY_LENGTH) {
    if (noIndex === keyword || noIndex.startsWith(`${keyword}_`)) return keyword;
  }
  return 'unknown';
}
