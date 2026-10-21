// On-phone storage for downloaded books and the Bookreels made from them (IndexedDB).
// Three stores: "items" (what the shelf shows, plus conversion progress), "texts" (the book text), "packs" (finished Bookreels).
// Falls back to memory when the browser blocks storage (e.g. some private windows); then nothing survives a reload.

const DB = "bookreel";
const VERSION = 1;
let dbp = null;
const memory = { items: new Map(), texts: new Map(), packs: new Map() };
let persistent = true;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(DB, VERSION); } catch (e) { persistent = false; return resolve(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ["items", "texts", "packs"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, name === "items" ? { keyPath: "id" } : undefined);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { persistent = false; resolve(null); };
    req.onblocked = () => { persistent = false; resolve(null); };
  });
  return dbp;
}

/** Runs one request in its own transaction and resolves with its result once the transaction commits. */
async function run(store, mode, make) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = make(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("Storage write was cancelled"));
  });
}

const useMemory = async () => !(await open());

export const isPersistent = () => persistent;

export async function allItems() {
  const list = (await useMemory()) ? [...memory.items.values()] : (await run("items", "readonly", (s) => s.getAll())) || [];
  return list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
}
export async function getItem(id) {
  return (await useMemory()) ? memory.items.get(id) : run("items", "readonly", (s) => s.get(id));
}
export async function putItem(item) {
  if (await useMemory()) return void memory.items.set(item.id, item);
  await run("items", "readwrite", (s) => s.put(item));
}
export async function getText(id) {
  return (await useMemory()) ? memory.texts.get(id) : run("texts", "readonly", (s) => s.get(id));
}
export async function putText(id, text) {
  if (await useMemory()) return void memory.texts.set(id, text);
  await run("texts", "readwrite", (s) => s.put(text, id));
}
export async function getPack(id) {
  return (await useMemory()) ? memory.packs.get(id) : run("packs", "readonly", (s) => s.get(id));
}
export async function putPack(id, pack) {
  if (await useMemory()) return void memory.packs.set(id, pack);
  await run("packs", "readwrite", (s) => s.put(pack, id));
}
export async function removeAll(id) {
  for (const store of ["items", "texts", "packs"]) {
    if (await useMemory()) memory[store].delete(id);
    else await run(store, "readwrite", (s) => s.delete(id));
  }
}

/** Ask the browser not to clear our storage when space runs low (best effort, silent). */
export function askToPersist() {
  try { navigator.storage?.persist?.(); } catch (e) { /* not supported */ }
}
