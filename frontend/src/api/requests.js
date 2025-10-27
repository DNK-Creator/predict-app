// src/api/requests.js (client side file)
import { useTelegram } from '@/services/telegram'

const { user } = useTelegram()

const MY_ID = user?.id
const BACKEND_URL = 'https://api.myoracleapp.com'

// helper: read token saved by App.vue
function getSessionToken() {
    try {
        if (typeof window === 'undefined') return null;
        return localStorage.getItem('tg_session');
    } catch (e) {
        return null;
    }
}

export async function apiFetch(path, {
    method = 'GET',
    body = null,
    signal = null,
    headers = {},
    timeoutMs = 10000
} = {}) {
    const url = `${BACKEND_URL}${path}`;

    // internal controller that we will actually pass to fetch.
    const controller = new AbortController();
    const internalSignal = controller.signal;

    // If caller passed a signal, wire it to abort our controller so
    // fetch sees controller.signal and will be aborted on either event.
    let removeCallerListener = null;
    if (signal) {
        // If already aborted, abort our controller immediately
        if (signal.aborted) {
            controller.abort();
        } else {
            const onCallerAbort = () => controller.abort();
            signal.addEventListener('abort', onCallerAbort, { once: true });
            // store removal helper in case environment doesn't support { once } or for extra safety
            removeCallerListener = () => {
                try { signal.removeEventListener('abort', onCallerAbort); } catch (e) { /* ignore */ }
            };
        }
    }

    // timeout that aborts our controller
    const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
        const opts = {
            method,
            headers: { ...headers },
            signal: internalSignal
        };

        if (body != null) {
            opts.body = typeof body === 'string' ? body : JSON.stringify(body);
            opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
        }

        // attach session token if available — but DO NOT overwrite an explicit Authorization header
        const sessionToken = getSessionToken();
        if (sessionToken) {
            // detect if caller already set an Authorization header (case-insensitive)
            const hasAuthHeader = Object.keys(opts.headers || {}).some(h => h.toLowerCase() === 'authorization' && String(opts.headers[h] || '').trim().length > 0);
            if (!hasAuthHeader) {
                opts.headers['Authorization'] = `Bearer ${sessionToken}`;
            } else {
                // if caller intentionally set Authorization (e.g. "tma <initData>"), don't override it
            }
        }

        const resp = await fetch(url, opts);

        // try parse JSON safely
        const text = await resp.text().catch(() => null);
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }

        if (!resp.ok) {
            const err = new Error(`HTTP ${resp.status}`);
            err.status = resp.status;
            // include parsed JSON when possible, else raw text
            err.body = json ?? text;
            throw err;
        }

        return { ok: true, status: resp.status, data: json, rawText: text };
    } catch (err) {
        // normalize AbortError -> consistent error object with name 'AbortError'
        if (err.name === 'AbortError') {
            const e = new Error('Request aborted/timed out');
            e.name = 'AbortError';
            throw e;
        }

        // preserve structured info if present, else normalize
        if (err.status || err.body) {
            // rethrow preserving shape
            throw err;
        }

        const e = new Error(err.message ?? 'Network error');
        e.original = err;
        throw e;
    } finally {
        // cleanup
        if (timeoutId) clearTimeout(timeoutId);
        if (removeCallerListener) removeCallerListener();
    }
}

export async function userFirstTimeOpening() {
    try {
        const { data } = await apiFetch(`/api/user/first-time`)
        // server returns { isFirstTime: boolean }
        return Boolean(data?.isFirstTime)
    } catch (err) {
        console.error('userFirstTimeOpening error', err)
        return false
    }
}

export async function getOrCreateUser(languageCode = null) {
    try {
        const body = { language: languageCode ?? null }
        const { data } = await apiFetch('/api/user/get-or-create', { method: 'POST', body })
        // server returns the user row or null
        return data?.user ?? null
    } catch (err) {
        console.error('getOrCreateUser error', err)
        throw err
    }
}

export async function registerRef(inviterTelegram) {
    if (!inviterTelegram) {
        console.warn('registerRef: missing inviter id', inviterTelegram)
        return
    }
    try {
        const payload = {
            inviter_telegram: Number(inviterTelegram)
        }
        const { data } = await apiFetch('/api/user/register-ref', { method: 'POST', body: payload })
        return data?.result ?? null
    } catch (err) {
        console.error('registerRef error', err)
        throw err
    }
}

export async function getUsersPoints() {
    try {
        const resp = await apiFetch('/api/user/points')
        return { data: resp.data?.row ?? null, error: null }
    } catch (err) {
        console.error('getUsersPoints error', err)
        return { data: null, error: err }
    }
}

export async function getUsersBetsSummary() {
    if (!MY_ID) return { countBets: 0, totalVolume: 0 }
    try {
        const resp = await apiFetch('/api/user/bets-summary')
        const { countBets = 0, totalVolume = 0 } = resp.data ?? {}
        return { countBets, totalVolume }
    } catch (err) {
        console.error('getUsersBetsSummary error', err)
        return { countBets: 0, totalVolume: 0 }
    }
}

export async function getUsersWonBetsCount() {
    if (!MY_ID) return 0
    try {
        const resp = await apiFetch('/api/user/won-bets-count')
        return resp.data?.bets_won ?? 0
    } catch (err) {
        console.error('getUsersWonBetsCount error', err)
        return 0
    }
}

export async function getUsersWalletAddress() {
    try {
        const resp = await apiFetch('/api/user/wallet-address')
        return resp.data?.wallet_address ?? null
    } catch (err) {
        console.error('getUsersWalletAddress error', err)
        return null
    }
}

export async function withdrawUserTon(amount, amount_cut, parsedAddress, idempotencyKey) {
    try {
        const { status, data } = await apiFetch('/api/withdraw', {
            method: 'POST',
            body: { amount, amount_cut, address: parsedAddress, idempotencyKey }
        });

        const ok = (typeof status === 'number') ? (status >= 200 && status < 300) : !!data?.success;
        return { ok, status, data };
    } catch (err) {
        console.error('withdrawUserTon error', err);
        return { ok: false, error: err };
    }
}


export async function getUsersReferrals() {
    try {
        const resp = await apiFetch('/api/user/referrals', { method: 'GET' })
        return Array.isArray(resp.data?.rows) ? resp.data.rows : []
    } catch (err) {
        console.error('getUsersReferrals error:', err)
        return []
    }
}

export async function updateUsersWallet(wallet_to_update) {
    try {
        await apiFetch('/api/user/update-wallet', {
            method: 'POST',
            body: { wallet_address: wallet_to_update }
        })
    } catch (err) {
        console.error('updateUsersWallet error: ', err)
    }
}

export async function getGiftsPrices() {
    try {
        const resp = await apiFetch('/api/gifts/prices')
        return Array.isArray(resp.data?.prices) ? resp.data.prices : []
    } catch (err) {
        console.error('getGiftsPrices error: ', err)
        return []
    }
}

export async function getUsersInventory() {
    if (!user?.id) return []
    try {
        const resp = await apiFetch('/api/user/inventory')
        return resp.data?.inventory ?? []
    } catch (err) {
        console.error('getUsersInventory error: ', err)
        return []
    }
}

export async function isBetAvailable(numericId) {
    try {
        const resp = await apiFetch(`/api/bet/${encodeURIComponent(numericId)}/availability`)
        return { data: resp.data, error: null }
    } catch (err) {
        console.error('isBetAvailable error', err)
        return { data: null, error: err }
    }
}

export async function updateUsername(name) {
    try {
        const resp = await apiFetch('/api/user/update-username', {
            method: 'POST',
            body: { username: name }
        })
        return resp.data?.ok ? null : new Error('update failed')
    } catch (err) {
        console.error('updateUsername error', err)
        return err
    }
}

export async function getUsersLanguage() {
    try {
        const resp = await apiFetch('/api/user/language')
        return { data: resp.data?.language ?? null, error: null }
    } catch (err) {
        console.error('getUsersLanguage error', err)
        return { data: null, error: err }
    }
}

export async function changeUsersLanguage(code) {
    try {
        const resp = await apiFetch('/api/user/change-language', { method: 'POST', body: { language: code } })
        return { error: resp.data?.error ?? null }
    } catch (err) {
        console.error('changeUsersLanguage error', err)
        return { error: err }
    }
}

export async function fetchUserReferrals() {
    try {
        const resp = await apiFetch('/api/user/referrals', { method: 'GET' })
        return { data: resp.data?.rows ?? [], error: null }
    } catch (err) {
        console.error('fetchUserReferrals error', err)
        return { data: null, error: err }
    }
}

export async function fetchBetsHolders(from = 0, to = 19) {
    try {
        const resp = await apiFetch(`/api/bets-holders?from=${from}&to=${to}`)
        return { data: resp.data?.rows ?? [], error: null }
    } catch (err) {
        console.error('fetchBetsHolders error', err)
        return { data: null, error: err }
    }
}

export async function fetchAllHolidays() {
    try {
        const resp = await apiFetch('/api/holidays')
        return { data: resp.data?.rows ?? [], error: null }
    } catch (err) {
        console.error('fetchAllHolidays error', err)
        return { data: null, error: err }
    }
}

export async function fetchUsersTransactions(appObj) {
    try {
        const resp = await apiFetch('/api/user/transactions')
        appObj.transactions = resp.data?.rows ?? []
    } catch (err) {
        console.error('fetchUsersTransactions error: ' + err)
        appObj.transactions = []
    }
}

export async function checkUserInChannel() {
    try {
        // server expects query param userId; we keep same argument behavior
        const resp = await apiFetch(`/api/channelMembership`, { method: 'GET' });
        // return apiFetch result (ok, status, data, rawText)
        return resp;
    } catch (err) {
        console.error('checkUserInChannel error', err);
        throw err;
    }
}

export async function fetchTonPrice() {
    try {
        const resp = await apiFetch('/api/tonprice', { method: 'GET' });
        return resp; // { ok, status, data, rawText }
    } catch (err) {
        console.error('fetchTonPrice error', err);
        throw err;
    }
}

export async function getGiftInfo(gift_slug) {
    try {
        const resp = await apiFetch(`/api/telegram/nft/${encodeURIComponent(gift_slug)}`, { method: 'GET' });
        return resp;
    } catch (err) {
        console.error('getGiftInfo error', err);
        throw err;
    }
}

export async function withdrawUsersGifts(withdrawal_payload) {
    try {
        const resp = await apiFetch('/api/withdraw-gifts', {
            method: 'POST',
            body: withdrawal_payload
        });
        return resp;
    } catch (err) {
        console.error('withdrawUsersGifts error', err);
        throw err;
    }
}

export async function payStarsForWithdrawal(stars_payload) {
    try {
        const resp = await apiFetch('/api/pay-withdraw', {
            method: 'POST',
            body: stars_payload
        });
        return resp;
    } catch (err) {
        console.error('payStarsForWithdrawal error', err);
        throw err;
    }
}

export async function depositUserStars(amountStarsRounded) {
    try {
        const resp = await apiFetch('/api/stars-payment', {
            method: 'POST',
            body: { amountStars: amountStarsRounded }
        });
        return resp;
    } catch (err) {
        console.error('depositUserStars error', err);
        throw err;
    }
}

export async function createDepositIntent(controller, amount, userParsedAddr) {
    try {
        const resp = await apiFetch('/api/deposit-intent', {
            method: 'POST',
            body: { amount, usersWallet: userParsedAddr },
            // pass the controller.signal to allow caller cancellation
            signal: controller?.signal ?? null
        });
        return resp;
    } catch (err) {
        console.error('createDepositIntent error', err);
        throw err;
    }
}

export async function cancelDepositIntent(controller, txId) {
    try {
        const resp = await apiFetch('/api/deposit-cancel', {
            method: 'POST',
            body: { txId },
            signal: controller?.signal ?? null
        });
        return resp;
    } catch (err) {
        console.error('cancelDepositIntent error', err);
        throw err;
    }
}

export async function fetchUsersBalanceWalletTon(address, { signal = null, timeoutMs = 10000 } = {}) {
    if (!address) throw new Error('address required');
    try {
        const resp = await apiFetch(`/api/balance?address=${encodeURIComponent(address)}`, {
            method: 'GET',
            signal,
            timeoutMs
        });
        return resp;
    } catch (err) {
        // Normalize abort error to keep previous behaviour consistent
        if (err.name === 'AbortError') {
            const e = new Error('Request aborted/timed out');
            e.name = 'AbortError';
            throw e;
        }
        throw err;
    }
}

export async function sendBotMessage(messageText) {
    try {
        const resp = await apiFetch('/api/botmessage', {
            method: 'POST',
            body: { messageText }
        });
        return resp;
    } catch (err) {
        console.error('sendBotMessage error', err);
        throw err;
    }
}

export async function createStarsDepositLink(amount) {
    try {
        const resp = await apiFetch('/api/invoice', {
            method: 'POST',
            body: { amount }
        });
        return resp;
    } catch (err) {
        console.error('createStarsDepositLink error', err);
        throw err;
    }
}

export async function placeBetNotification(bet_info_payload) {
    try {
        // If bet_info_payload is already a string (rare), apiFetch will pass it through.
        const resp = await apiFetch('/api/bet-placed', {
            method: 'POST',
            body: bet_info_payload
        });
        return resp;
    } catch (err) {
        console.error('placeBetNotification error', err);
        throw err;
    }
}

export async function validateDataOnServer(initDataRaw) {
    try {
        // Send initData in body (safer than putting it in Authorization header)
        const resp = await apiFetch('/api/telegram/validate', {
            method: 'POST',
            body: { initData: initDataRaw }
        });
        return resp;
    } catch (err) {
        console.error('validateDataOnServer error', err);
        throw err;
    }
}
