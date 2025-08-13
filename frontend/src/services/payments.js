// src/services/payment.js
export async function fetchInvoiceLink(amount) {
    const resp = await fetch("https://api.giftspredict.ru/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });
    console.log(resp)
    if (!resp.ok) throw new Error("invoice creation failed");
    const { link } = await resp.json();
    return link;
}

// call from browser / frontend
export async function fetchBotMessageTransaction(messageText, userID) {
    const resp = await fetch("https://api.giftspredict.ru/api/botmessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageText, userID }),
    });

    // read body and check status
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
        // surface server error text if present
        throw new Error(data?.error || `Bot message failed: ${resp.status}`);
    }
    return data; // success payload from server
}
