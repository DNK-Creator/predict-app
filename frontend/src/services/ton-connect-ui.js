// src/services/tonConnect.js
import { TonConnectUI } from "@tonconnect/ui";

let tonInstance = null;

export function getTonConnect() {
  if (!tonInstance) {
    tonInstance = new TonConnectUI({
      manifestUrl: 'https://giftspredict.ru/tonconnect-manifest.json',
      uiOptions: {
        twaReturnUrl: window.location.href,
        uiPreferences: {}
      }
    });
  }
  return tonInstance;
}
