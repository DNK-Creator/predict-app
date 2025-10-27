import { createStarsDepositLink, sendBotMessage } from "@/api/requests";

// src/services/payment.js
export async function fetchInvoiceLink(amount) {
    const resp = await createStarsDepositLink(amount)

    if (!resp || !resp.ok) {
        // Handle HTTP errors (4xx, 5xx)
        const err = new Error(`Create stars pay error: ${resp?.status || 'NETWORK_ERROR'}`)
        err.status = resp?.status || 0
        err.body = resp?.data || 'Network error'
        throw err
    }
    const { link } = await resp.data;
    return link;
}

// helper: call backend endpoint
export async function fetchBotMessageTransaction(messageText) {
    try {
        const resp = await sendBotMessage(messageText)

        if (!resp || !resp.ok) {
            // Handle HTTP errors (4xx, 5xx)
            const err = new Error(`Send a bot message error: ${resp?.status || 'NETWORK_ERROR'}`)
            err.status = resp?.status || 0
            err.body = resp?.data || 'Network error'
            throw err
        }

        return true;
    } catch (e) {
        console.error('fetchBotMessageTransaction error', e);
        return false;
    }
}
