// Small shared helpers.
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
export const pad2 = (n) => String(n).padStart(2, "0");
export function compactCount(x) {
  if (x < 1000) return String(x);
  const v = Math.floor(x / 100) / 10;
  return (Number.isInteger(v) ? String(v) : v.toFixed(1)) + "k";
}

const PATHS = {
  heart: "M12 20.5s-6.9-4.3-9.4-8.6C.9 8.8 2.7 4.9 6.4 4.6c2.3-.2 4 1.1 5.6 3.1 1.6-2 3.3-3.3 5.6-3.1 3.7.3 5.5 4.2 3.8 7.3C18.9 16.2 12 20.5 12 20.5z",
  bookmark: "M6 3.5h12v17.2l-6-4.5-6 4.5z",
  comment: "M20.5 11.6a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.2a8.5 8.5 0 1 1 15.6-4.7z",
  send: "M21.5 3 10.3 14.2M21.5 3l-6.8 18-4.4-6.8L3.5 9.8z",
  close: "M5.5 5.5l13 13M18.5 5.5l-13 13",
  back: "M15 5l-7 7 7 7",
  grid: "M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z",
  flame: "M12 21.5c-4 0-6.8-2.8-6.8-6.5 0-3.8 3.1-5.9 4.1-9.9.2-.9 1.3-1.2 1.9-.5 2.5 2.9 2.6 5.1 2.4 6.6 1-.5 1.8-1.5 2.1-2.8.2-.7 1.1-.9 1.5-.3 1.1 1.7 1.7 3.7 1.7 5.9 0 4.1-2.9 7.5-6.9 7.5z",
  lock: "M5 10.5h14v10H5zM8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7",
  info: "M12 3a9 9 0 1 0 .01 0zM12 11v6M12 7.6v.2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  home: "M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4z",
  person: "M12 4.5a4 4 0 1 0 .01 0zM4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6",
  search: "M11 4a7 7 0 1 0 .01 0zM20 20l-4-4",
  play: "M8 5.5v13l10.5-6.5z",
  medal: "M12 9a5.5 5.5 0 1 0 .01 0zM8.6 3.5l2.1 5.9M15.4 3.5l-2.1 5.9",
  calendar: "M4.5 6h15v14h-15zM4.5 10h15M8.5 3.5v4M15.5 3.5v4",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
};
const FILLED = new Set(["play"]);

/** Inline line icon. `filled` fills the shape (heart, bookmark). */
export function icon(name, { size = 24, filled = false, label = "" } = {}) {
  const fill = filled || FILLED.has(name) ? "currentColor" : "none";
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"';
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ${a11y}><path d="${PATHS[name]}"/></svg>`;
}
