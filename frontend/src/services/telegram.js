export function useTelegram() {
  const tg = (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  return {
    tg,
    user: tg?.initDataUnsafe?.user ?? null,
    initDataRaw: tg?.initData ?? null
  }
}