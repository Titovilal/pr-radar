import { useEffect, useState } from "react";
import { load, type StorageKey, type StorageValue } from "./storage";

/** Reads a chrome.storage.local key and re-renders when the background updates it. */
export function useStored<K extends StorageKey>(key: K): StorageValue<K> | undefined {
  const [value, setValue] = useState<StorageValue<K>>();

  useEffect(() => {
    void load(key).then(setValue);
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && key in changes) void load(key).then(setValue);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [key]);

  return value;
}
