// Chapter-opening illustrations drawn as SVG in a 320 × 190 space, ported from the Android HookArt.kt.
import { esc } from "./util.js";

const P = {
  steel: "#1B2026", onDark: "#F0ECE4", sodium: "#F4A23C", tagRed: "#D63A2F", tagGreen: "#2E9C5A",
  ok: "#43C27A", ticket: "#F1EDE2", ink: "#17191C", hazard: "#F2C200",
};
let uid = 0;

const rr = (fill, x, y, w, h, r = 0, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
const circle = (fill, r, x, y) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const line = (stroke, x1, y1, x2, y2, w, cap = "butt") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="${cap}"/>`;
function label(text, x, y, size, color, { mono = true, weight = 500, anchor = "middle" } = {}) {
  const fam = mono ? "var(--f-mono)" : "var(--f-display)";
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" text-anchor="${anchor}" dominant-baseline="central" style="font-family:${fam};font-weight:${weight}">${esc(text)}</text>`;
}
function vgrad(stops, y1 = 0, y2 = 190) {
  const id = "g" + ++uid;
  const s = stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("");
  return { id, def: `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${y1}" x2="0" y2="${y2}">${s}</linearGradient>` };
}
const svg = (defs, body, alt) => `<svg class="art" viewBox="0 0 320 190" role="img" aria-label="${esc(alt || "Chapter illustration")}"><defs>${defs}</defs>${body}</svg>`;

function parking() {
  let b = rr("#262A30", 0, 0, 320, 190, 14);
  for (const x of [40, 160, 280]) b += line(P.hazard, x, 0, x, 152, 4);
  b += label("PLANT MANAGER", 100, 172, 11, "#E9E4D8") + label("CONTROLLER", 220, 172, 11, "#8B9097");
  b += rr("#B3202A", 66, 16, 68, 126, 17) + rr("#3A0D12", 74, 42, 52, 24, 6) + rr("#3A0D12", 76, 104, 48, 17, 5);
  b += rr("#F0ECE4", 84, 130, 32, 8, 1.5) + label("NUMBER 1", 100, 134, 5.2, P.ink, { weight: 600 });
  b += rr("#5E7FA6", 193, 36, 54, 102, 14) + rr("#1D2A3A", 200, 57, 40, 19, 5) + rr("#1D2A3A", 201, 108, 38, 13, 4);
  return svg("", b, "A red car parked in the plant manager's space");
}

function hill() {
  const sky = vgrad(["#5F9BD3", "#A9CDEB", "#D9E7EF"], 0, 110);
  const field = vgrad(["#C2A867", "#9A8250"], 102, 190);
  let b = rr(`url(#${sky.id})`, 0, 0, 320, 190, 12);
  b += circle("#FFF1C455", 34, 250, 40) + circle("#FFF1C4", 22, 250, 40);
  b += rr("#7E848C", 192, 76, 90, 14) + rr(`url(#${field.id})`, 0, 102, 320, 88);
  b += rr("#8B9097", 180, 90, 96, 13) + rr("#717780", 46, 64, 148, 40) + rr("#A9C3D6", 26, 84, 42, 20);
  b += rr("#E9E4D8", 196, 94, 22, 9) + rr("#E9E4D8", 222, 94, 22, 9) + rr("#5D5446", 0, 124, 320, 5);
  b += `<ellipse cx="90" cy="200" rx="140" ry="60" fill="#5E4E2C"/>` + rr("#5E7FA6", 96, 146, 38, 14, 5);
  return svg(sky.def + field.def, b, "A factory seen from a hillside");
}

function clock(time, place) {
  const g = vgrad(["#0B1022", "#1F1A3A"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  for (const [x, y] of [[20, 22], [60, 50], [110, 18], [290, 30], [250, 70], [30, 120], [300, 140], [150, 40]]) b += circle("#FFFFFFCC", 1.3, x, y);
  b += circle("#F6E7B0", 22, 262, 44) + circle("#151632", 20, 272, 38);
  b += rr("#0A0A0C", 70, 70, 180, 70, 10) + rr("#1A1A20", 76, 76, 168, 58, 7);
  b += label(time, 160, 106, 34, "#FF4B3E", { weight: 600 });
  if (place) b += label(place, 160, 162, 11, "#B9B3D8");
  return svg(g.def, b, `A clock showing ${time}`);
}

function skyline(caption) {
  const g = vgrad(["#2B2440", "#E08A5A", "#F6C976"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12) + circle("#FFE3A0", 20, 230, 120);
  const towers = [[10, 70], [38, 110], [64, 85], [92, 140], [120, 95], [150, 120], [178, 80], [204, 150], [232, 100], [262, 125], [290, 90]];
  towers.forEach(([x, h], i) => {
    const top = 190 - h;
    b += rr("#1B1D2A", x, top, 26, h);
    for (let wy = top + 10; wy < 182; wy += 12) {
      if ((i + Math.floor(wy / 10)) % 3 !== 0) b += rr("#F6C976", x + 6, wy, 4, 4);
      if ((i * 7 + Math.floor(wy / 10)) % 4 === 0) b += rr("#F6C976", x + 15, wy, 4, 4);
    }
  });
  if (caption) b += label(caption, 70, 26, 13, "#F6E7D0", { weight: 600 });
  return svg(g.def, b, "A city skyline at dawn");
}

function bez(t) {
  const u = 1 - t;
  return [u * u * u * 10 + 3 * u * u * t * 90 + 3 * u * t * t * 170 + t * t * t * 310, u * u * u * 150 + 3 * u * u * t * 100 + 3 * u * t * t * 170 + t * t * t * 92];
}
function trail(caption) {
  const g = vgrad(["#3E5F2F", "#2A4220"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  for (const x of [30, 90, 250, 300]) b += `<path d="M${x} 20L${x - 14} 52L${x + 14} 52Z" fill="#223A1A"/>`;
  b += `<path d="M10 150C90 100 170 170 310 92" fill="none" stroke="#C9B48A" stroke-width="16" stroke-linecap="round"/>`;
  for (const t of [0.97, 0.93, 0.89, 0.84, 0.76, 0.7, 0.58, 0.5, 0.33]) { const [x, y] = bez(t); b += circle(P.onDark, 5, x, y); }
  const [hx, hy] = bez(0.12);
  b += circle(P.sodium, 8, hx, hy) + label(caption || "THE GAP GROWS", 92, 26, 12, P.onDark, { weight: 600 });
  return svg(g.def, b, "Hikers spreading out along a trail");
}

function dice() {
  const g = vgrad(["#6E5A2E", "#4F3F1F"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  [3, 1, 5, 2, 4].forEach((n, i) => {
    const cx = 40 + i * 52;
    b += `<ellipse cx="${cx}" cy="139" rx="22" ry="11" fill="#E9E4D8"/><ellipse cx="${cx}" cy="138" rx="18" ry="7" fill="#BFB8A8"/>`;
    for (let m = 0; m < n; m++) { const x = cx - 10 + m * 5; b += line("#F2D9A0", x, 136, x + 3, 116, 2.5) + circle(P.tagRed, 2.6, x + 3, 115); }
  });
  b += `<g transform="rotate(-12 160 62)">${rr("#F7F3EA", 130, 32, 60, 60, 12)}${[[144, 46], [176, 46], [144, 78], [176, 78]].map(([x, y]) => circle(P.ink, 5, x, y)).join("")}</g>`;
  return svg(g.def, b, "A die, matchsticks and bowls");
}

function house() {
  const g = vgrad(["#0E1220", "#2A2440"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12) + circle("#F6E7B0", 16, 270, 38);
  b += `<path d="M80 86L160 36L240 86Z" fill="#14121E"/>` + rr("#1C1928", 92, 86, 136, 84);
  b += rr("#2A2638", 108, 102, 28, 26) + rr("#F6C976", 184, 102, 28, 26) + circle("#F6C97633", 40, 198, 115);
  b += rr("#2A2638", 146, 132, 26, 38) + rr("#3A3548", 236, 156, 70, 14) + rr("#0B0A12", 0, 170, 320, 20);
  return svg(g.def, b, "A dark house with one lit window");
}

function machine(name, status) {
  let b = rr("#20262E", 0, 0, 320, 190, 12) + rr("#2B323C", 0, 160, 320, 30);
  b += rr("#B6A3E8", 40, 34, 170, 126, 10) + rr("#8E7CC9", 52, 48, 92, 64, 6) + rr("#14171C", 58, 54, 80, 52, 4);
  b += line("#9FD8C9", 64, 92, 132, 66, 2);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b += circle(["#FF4B3E", P.ok, P.hazard][(r + c) % 3], 4.5, 162 + c * 14, 60 + r * 14);
  b += rr("#6F5FA8", 52, 122, 146, 26, 4) + label(name, 125, 135, 13, "#fff", { mono: false, weight: 900 });
  const bad = /DOWN|IDLE|LOST/.test(status);
  b += rr("#0F1317", 222, 66, 82, 46, 8) + circle(bad ? "#FF4B3E" : P.ok, 6, 238, 89);
  b += label(status, 274, 89, 9, bad ? "#FF7A6E" : P.ok, { weight: 600 }) + rr("#3A414C", 30, 160, 190, 6);
  return svg("", b, `A machine, ${name}, status ${status}`);
}

function stamp(word, sub) {
  let b = rr(P.ticket, 0, 0, 320, 190, 12);
  for (let y = 0; y < 190; y += 18) b += line("#17191C14", 0, y, 320, y, 1);
  b += `<g transform="rotate(-7 160 95)"><rect x="40" y="50" width="240" height="90" rx="8" fill="none" stroke="${P.tagGreen}" stroke-width="5"/>`;
  b += `<rect x="48" y="58" width="224" height="74" rx="5" fill="none" stroke="${P.tagGreen}" stroke-width="1.5"/>`;
  b += label(word, 160, 92, word.length > 9 ? 30 : 40, P.tagGreen, { mono: false, weight: 900 });
  if (sub) b += label(sub, 160, 124, 10, P.tagGreen, { weight: 600 });
  return svg("", b + "</g>", `A rubber stamp reading ${word}`);
}

function drum() {
  const g = vgrad(["#2E9C5A", "#1C6A3C"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  b += `<ellipse cx="81" cy="75" rx="45" ry="15" fill="#E9E4D8"/>` + rr("#C8312A", 36, 75, 90, 54) + `<ellipse cx="81" cy="129" rx="45" ry="15" fill="#C8312A"/><ellipse cx="81" cy="75" rx="43" ry="14" fill="#F2EDE4"/>`;
  for (let i = 0; i < 5; i++) b += line("#F2D9A0", 42 + i * 20, 80, 52 + i * 20, 128, 2);
  b += line("#8B5A2B", 70, 40, 96, 70, 5, "round");
  b += `<path d="M126 100C170 70 220 130 300 100" fill="none" stroke="#F2D9A0" stroke-width="3" stroke-linecap="round"/>`;
  [160, 196, 232, 268, 296].forEach((x, i) => { b += circle(P.onDark, 6, x, 150 - (i % 2) * 4); });
  b += label("DRUM · BUFFER · ROPE", 210, 30, 11, "#fff", { weight: 600 });
  return svg(g.def, b, "A drum tied to a line of walkers by a rope");
}

function bars(caption) {
  let b = rr(P.steel, 0, 0, 320, 190, 12) + line("#38414C", 30, 160, 300, 160, 2);
  const hs = [28, 34, 30, 46, 62, 84, 110];
  hs.forEach((h, i) => { b += rr(i === hs.length - 1 ? P.sodium : "#5B6470", 40 + i * 37, 160 - h, 24, h, 4); });
  b += `<path d="M52 128L126 122L200 92L274 44" fill="none" stroke="${P.ok}" stroke-width="3" stroke-linecap="round"/>` + circle(P.ok, 5, 274, 44);
  if (caption) b += label(caption, 40, 26, 12, P.onDark, { weight: 600, anchor: "start" });
  return svg("", b, "Rising bars");
}

function chain(caption) {
  let b = rr("#17191C", 0, 0, 320, 190, 12);
  for (let i = 0; i < 7; i++) {
    const x = 18 + i * 42; const weak = i === 4; const c = weak ? P.tagRed : "#9AA3AE"; const w = weak ? 4 : 7;
    b += i % 2 === 0
      ? `<rect x="${x}" y="80" width="56" height="30" rx="15" fill="none" stroke="${c}" stroke-width="${w}"/>`
      : `<rect x="${x + 6}" y="89" width="44" height="12" rx="6" fill="none" stroke="${c}" stroke-width="${w}"/>`;
  }
  b += line(P.tagRed, 196, 72, 204, 86, 2) + line(P.tagRed, 208, 104, 214, 118, 2);
  b += label(caption || "THE WEAKEST LINK", 160, 150, 12, P.sodium, { weight: 600 });
  return svg("", b, "A chain with one weak link");
}

// ---- Mystery set (A Study in Scarlet and other classics)

function lens(caption) {
  const g = vgrad(["#3A0F14", "#1A0709"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  for (let y = 18; y < 190; y += 22) b += line("#F6E7D612", 20, y, 300, y, 1);
  b += `<text x="70" y="110" font-size="44" fill="#C21F2B" style="font-family:var(--f-hand);font-weight:700" transform="rotate(-6 120 100)">RACHE</text>`;
  b += `<circle cx="200" cy="86" r="48" fill="#F6E7D60F" stroke="#E9D9C2" stroke-width="7"/>`;
  b += line("#8B5A2B", 232, 122, 272, 166, 11, "round");
  if (caption) b += label(caption, 24, 24, 11, "#F6E7D6", { weight: 600, anchor: "start" });
  return svg(g.def, b, "A magnifying glass over a word written on a wall");
}

function fog(caption) {
  const g = vgrad(["#2C3440", "#59606A", "#A7A9A3"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  for (const [x, h] of [[20, 70], [70, 96], [118, 60], [160, 110], [214, 80], [262, 100]]) b += rr("#20262E", x, 190 - h, 42, h);
  b += rr("#20262E", 140, 40, 6, 110) + circle("#F6C976", 9, 143, 36) + circle("#F6C97640", 30, 143, 36);
  for (let i = 0; i < 4; i++) b += `<ellipse cx="${60 + i * 70}" cy="${150 - (i % 2) * 14}" rx="80" ry="12" fill="#D9DCDF33"/>`;
  if (caption) b += label(caption, 24, 24, 11, "#F0ECE4", { weight: 600, anchor: "start" });
  return svg(g.def, b, "A gas lamp in London fog");
}

function door(number, caption) {
  let b = rr("#1C2A24", 0, 0, 320, 190, 12) + rr("#3B2A20", 0, 166, 320, 24);
  b += rr("#14201B", 110, 22, 100, 144, 4) + rr("#0F1813", 122, 34, 76, 60, 3) + rr("#0F1813", 122, 102, 76, 58, 3);
  b += circle("#C9A24A", 5, 190, 104) + rr("#C9A24A", 140, 6, 40, 14, 3);
  b += label(number || "221B", 160, 13, 10, P.ink, { weight: 600 });
  b += rr("#F6C976", 40, 40, 44, 56, 3) + rr("#F6C976", 236, 40, 44, 56, 3);
  b += line("#1C2A24", 62, 40, 62, 96, 2) + line("#1C2A24", 258, 40, 258, 96, 2);
  if (caption) b += label(caption, 160, 178, 11, "#E9E4D8", { weight: 600 });
  return svg("", b, `A front door numbered ${number || "221B"}`);
}

function desert(caption) {
  const g = vgrad(["#F0B35A", "#E9D3A2"], 0, 120);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12) + circle("#FFF3D0", 24, 250, 44);
  b += `<path d="M0 108L60 70L110 96L170 52L230 92L280 66L320 88V190H0Z" fill="#B98A5A"/>`;
  b += `<path d="M0 132C80 118 200 140 320 124V190H0Z" fill="#E8DCC4"/>`;
  b += rr("#6B5A48", 92, 140, 3, 18) + rr("#6B5A48", 104, 140, 3, 18) + `<path d="M86 140L113 140L100 128Z" fill="#6B5A48"/>`;
  b += circle("#3A2E24", 4, 210, 150) + circle("#3A2E24", 2.5, 222, 154);
  if (caption) b += label(caption, 24, 24, 11, "#3A2E24", { weight: 600, anchor: "start" });
  return svg(g.def, b, "A salt desert under a hard sun");
}

function countdown(num, caption) {
  let b = rr("#3A2B1F", 0, 0, 320, 190, 12);
  for (let x = 0; x < 320; x += 26) b += rr("#33251A", x, 0, 2, 190);
  b += `<text x="160" y="104" font-size="96" text-anchor="middle" dominant-baseline="central" fill="#E9D9C2" style="font-family:var(--f-hand);font-weight:700">${esc(num || "29")}</text>`;
  if (caption) b += label(caption, 160, 170, 11, "#E9D9C2", { weight: 600 });
  return svg("", b, `The number ${num || "29"} chalked on a wall`);
}

function pills(caption) {
  let b = rr("#14181D", 0, 0, 320, 190, 12) + `<ellipse cx="160" cy="132" rx="96" ry="20" fill="#0C0F12"/>`;
  b += rr("#E9E4D8", 98, 70, 124, 52, 8) + rr("#C9C2B2", 98, 70, 124, 14, 8);
  b += circle("#F0ECE4", 13, 136, 102) + circle("#F0ECE4", 13, 184, 102) + circle("#D7D0C0", 13, 184, 102);
  b += label("?", 136, 102, 14, "#7E1D22", { weight: 600 }) + label("?", 184, 102, 14, "#7E1D22", { weight: 600 });
  if (caption) b += label(caption, 160, 34, 12, "#F6E7D6", { weight: 600 });
  return svg("", b, "A box with two identical pills");
}

function ring(caption) {
  const g = vgrad(["#241A1E", "#120D10"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12);
  b += `<ellipse cx="160" cy="98" rx="46" ry="40" fill="none" stroke="#E2B65A" stroke-width="12"/>`;
  b += `<ellipse cx="160" cy="98" rx="46" ry="40" fill="none" stroke="#FFF0B3" stroke-width="2" stroke-dasharray="6 18"/>`;
  b += `<path d="M126 82Q160 60 194 82" fill="none" stroke="#FFF7D6" stroke-width="3" stroke-linecap="round" opacity=".7"/>`;
  if (caption) b += label(caption, 160, 168, 12, "#F6E7D6", { weight: 600 });
  return svg(g.def, b, "A woman's wedding ring");
}

function cab(caption) {
  const g = vgrad(["#1E2733", "#0E1218"]);
  let b = rr(`url(#${g.id})`, 0, 0, 320, 190, 12) + rr("#2B2F35", 0, 150, 320, 40);
  b += rr("#2E1B12", 120, 78, 108, 64, 8) + rr("#40281A", 128, 86, 46, 32, 4) + rr("#F6C97699", 182, 88, 36, 26, 4);
  b += `<circle cx="146" cy="148" r="18" fill="none" stroke="#B8A27A" stroke-width="5"/><circle cx="210" cy="148" r="18" fill="none" stroke="#B8A27A" stroke-width="5"/>`;
  b += rr("#2E1B12", 92, 50, 22, 10, 3) + line("#2E1B12", 103, 60, 128, 86, 4);
  b += `<path d="M24 110C40 92 60 92 80 104L92 130H24Z" fill="#3A2E24"/>` + circle("#3A2E24", 10, 62, 92);
  if (caption) b += label(caption, 24, 24, 11, "#E9E4D8", { weight: 600, anchor: "start" });
  return svg(g.def, b, "A horse-drawn cab at night");
}

/** Split-flap departure board; the letters animate when its card becomes visible. */
function board(text) {
  const rows = text ? text.split("|") : ["NEW YORK", "FINAL CALL", "HOUSTON", "BOARDING", "ATLANTA", "ON TIME"];
  const pairs = [];
  for (let i = 0; i + 1 < rows.length; i += 2) pairs.push([rows[i].padEnd(9).slice(0, 9), rows[i + 1].padEnd(10).slice(0, 10)]);
  const cells = pairs.map(([a, b], r) => `<div class="flaps">${[...(a + b)].map((ch, k) =>
    `${k === 9 ? '<i class="gap"></i>' : ""}<span class="flap${r === 0 && k >= 9 ? " hot" : ""}" data-c="${esc(ch)}">${ch === " " ? "&nbsp;" : esc(ch)}</span>`).join("")}</div>`).join("");
  return `<div class="board" data-anim="board"><div class="board-h"><span>DEPARTURES</span><span>O’HARE</span></div>${cells}</div>`;
}

export function hookArt(art, text) {
  const p = (text || "").split("|");
  switch (art) {
    case "parking": return parking();
    case "board": return board(text && text.split("|").length >= 2 ? text : "");
    case "hill": return hill();
    case "clock": return clock(p[0] || "3:00 AM", p[1] || "");
    case "skyline": return skyline(p[0] || "");
    case "trail": return trail(p[0] || "");
    case "dice": return dice();
    case "house": return house();
    case "machine": return machine(p[0] || "NCX-10", p[1] || "RUNNING");
    case "stamp": return stamp(p[0] || "SHIPPED", p[1] || "");
    case "drum": return drum();
    case "bars": return bars(p[0] || "");
    case "chain": return chain(p[0] || "");
    case "lens": return lens(p[0] || "");
    case "fog": return fog(p[0] || "");
    case "door": return door(p[0] || "", p[1] || "");
    case "desert": return desert(p[0] || "");
    case "countdown": return countdown(p[0] || "", p[1] || "");
    case "pills": return pills(p[0] || "");
    case "ring": return ring(p[0] || "");
    case "cab": return cab(p[0] || "");
    default: return stamp(p[0] || "BOOKREEL", p[1] || "");
  }
}

export const ART_KEYS = ["parking", "board", "hill", "clock", "skyline", "trail", "dice", "house", "machine", "stamp", "drum", "bars", "chain", "lens", "fog", "door", "desert", "countdown", "pills", "ring", "cab"];
