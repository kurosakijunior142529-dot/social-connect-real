import { useCallback, useEffect, useState } from "react";

const KEY = "vibely:ai-smart-replies";
const EVT = "vibely:ai-smart-replies-changed";

export function getSmartRepliesEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSmartRepliesEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

export function useSmartRepliesEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(getSmartRepliesEnabled());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((next: boolean) => {
    setSmartRepliesEnabled(next);
    setOn(next);
  }, []);

  return [on, update];
}
