// src/services/tonConnect.js
import { TonConnectUI } from "@tonconnect/ui";

let tonInstance = null;

export function getTonConnect() {

  if (tonInstance) return tonInstance;

  const tc = new TonConnectUI({
    manifestUrl: 'https://giftspredict.ru/tonconnect-manifest.json',
    uiOptions: {
      twaReturnUrl: window.location.href,
      uiPreferences: {}
    }
  });

  tc._attachedEvents = tc._attachedEvents || new Set();

  // helper to attach events only once
  tc.attachOnce = function (eventName, handler) {
    if (tc._attachedEvents.has(eventName)) return;
    tc._attachedEvents.add(eventName);
    // adapt to library API - common patterns:
    if (typeof tc.on === 'function') {
      tc.on(eventName, handler);
    } else {
      // fallback: listen to window custom events the SDK emits
      window.addEventListener(eventName, handler);
    }
  };

  tonInstance = tc;

  return tonInstance;
}
