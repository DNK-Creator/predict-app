// src/services/payment.js
export async function fetchInvoiceLink(amount) {
    const resp = await fetch("/api/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
    });
    console.log(resp)
    if (!resp.ok) throw new Error("invoice creation failed");
    const { link } = await resp.json();
    return link;
}