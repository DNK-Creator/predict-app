import { createStarsDepositLink, sendBotMessage } from "@/api/requests";

// src/services/payment.js
export async function fetchInvoiceLink(amount) {
    const resp = await createStarsDepositLink(amount)

    if (!resp.ok) throw new Error("invoice creation failed");
    const { link } = await resp.json();
    return link;
}

// helper: call backend endpoint
export async function fetchBotMessageTransaction(messageText) {
    try {
        const resp = await sendBotMessage(messageText)

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
