import { getMdiPath } from './mdi_registry.js';
const cache = new Map();
/** SVG path inside the icon is filled. No decorative circle, chip, or background. */
export function mdiDataUri(name, color = '#355469') {
  const key=name+'|'+color;
  if (cache.has(key)) return cache.get(key);
  const path=getMdiPath(name);
  const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="'+color+'" d="'+path+'"/></svg>';
  const uri='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  cache.set(key,uri);
  return uri;
}
