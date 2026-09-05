import { initialState, parseState } from "./model.mjs";
export const STORAGE_KEY = "atlas-dashboards-v1";

/** Small adapter boundary: a hosted app can replace load/save without changing the canvas. */
export function browserStorage(getStorage = () => window.localStorage) {
  let blocked = false;
  let unsaved = false;
  return {
    load() {
      try {
        const raw = getStorage().getItem(STORAGE_KEY);
        return { state: raw ? parseState(raw) : initialState(), message: raw ? "Saved in this browser" : "Changes save in this browser" };
      } catch {
        // Do not overwrite an unreadable save merely by initializing the preview.
        blocked = true;
        return { state: initialState(), message: "Saved layout could not be loaded. Changes remain in this session." };
      }
    },
    hasUnsavedChanges() { return unsaved; },
    save(state) {
      unsaved = true;
      if (blocked) return { saved: false, message: "Changes remain in this session; the previous save has been preserved." };
      try {
        getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
        unsaved = false;
        return { saved: true, message: "Saved in this browser" };
      } catch {
        return { saved: false, message: "Browser storage is unavailable. Changes remain in this session." };
      }
    },
  };
}
