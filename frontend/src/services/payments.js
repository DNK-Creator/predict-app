// src/services/payment.js
export async function fetchInvoiceLink(amount) {
    const resp = await fetch("https://api.giftspredict.ru/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });
    if (!resp.ok) throw new Error("invoice creation failed");
    const { link } = await resp.json();
    return link;
}

// helper: call backend endpoint
export async function fetchBotMessageTransaction(messageText, userId) {
    try {
        const resp = await fetch('https://api.giftspredict.ru/api/botmessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageText, userID: userId }),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => null);
            console.warn('botmessage endpoint returned non-OK', resp.status, err);
            return false;
        }
        const json = await resp.json().catch(() => null);
        return json;
    } catch (e) {
        console.error('fetchBotMessageTransaction error', e);
        return false;
    }
}
