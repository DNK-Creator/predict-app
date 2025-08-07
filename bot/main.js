import fetch from 'node-fetch'
import { Telegraf, Markup, session } from "telegraf"
import 'dotenv/config'
import express from "express"

const token = process.env.BOT_TOKEN
const webAppUrl = "https://gifts-predict.web.app/"
const bot = new Telegraf(token)
// install session middleware
bot.use(session())

const effectIdTwo = "5046509860389126442"


const app = express();
app.use(express.json());

// New: savePreparedInlineMessage
app.post('/api/prepareShare', async (req, res) => {
    console.log('Api PrepareShare Got Hit')
    const { mediaUrl, caption } = req.body;
    if (!mediaUrl || !caption) {
        return res.status(400).json({ error: 'mediaUrl and caption required' });
    }

    try {
        // Call the core method via Bot-API
        const resp = await fetch(
            `https://api.telegram.org/bot${token}/messages.savePreparedInlineMessage`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: {
                        _: 'messageMediaPhoto',
                        media: mediaUrl,
                        caption: caption,
                        parse_mode: 'HTML',
                    }
                })
            }
        );
        const { ok, result, error_code, description } = await resp.json();
        if (!ok) {
            throw new Error(`${error_code}: ${description}`);
        }

        // result.id is the preparedMessageId
        res.json({ preparedMessageId: result.id });
    } catch (err) {
        console.error('⛔ prepareShare failed:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/invoice", async (req, res) => {
    console.log('Hit /api/invoice')
    try {
        const { amount } = req.body;
        const link = await createInvoiceLink(amount);
        res.json({ link });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "failed to create invoice" });
    }
});


export async function createInvoiceLink(amount) {
    return bot.telegram.createInvoiceLink(
        {
            title: "Deposit With Stars",
            description: "Some description",
            payload: "{}",
            provider_token: "",
            currency: "XTR",
            prices: [{ amount: amount, label: `${amount * 2} Coins!` }]
        }
    );
}

// helper to pull deep-link payload from "/start ABC123"
function extractPayload(ctx) {
    if (!ctx.message || !ctx.message.text) return null
    const parts = ctx.message.text.split(" ")
    // allow "/start=ABC123", "/start ABC123", or even "/startABC123"
    if (parts[0].startsWith("/start")) {
        // after "/start", grab anything after '=' or space
        const raw = parts[0].includes("=")
            ? parts[0].split("=")[1]
            : (parts[1] || null)
        return raw
    }
    return null
}

// pull all the logic into one function
async function handleStart(ctx) {
    try {

        await ctx.telegram.setMessageReaction(
            ctx.chat.id,
            ctx.message.message_id,
            [
                {
                    type: "emoji",
                    emoji: "🔥"
                }
            ],
            false
        );

        await ctx.sendChatAction('typing');

        // ensure session exists
        if (!ctx.session) ctx.session = {}

        // if they launched via deep-link, save it
        const incoming = extractPayload(ctx)
        if (incoming) {
            ctx.session.ref = incoming
            console.log("Saved ref for", ctx.from.id, "=", incoming)
        }

        return ctx.replyWithPhoto(
            { url: "https://i.postimg.cc/Hkww4N89/Main-Menu-Bot.png" },
            {
                caption: "Добро пожаловать в <b>Gifts Predict! 🔮 </b> Здесь ты можешь использовать свои знания, " +
                    "чтобы предсказывать результаты будущих событий и зарабатывать.",
                parse_mode: "HTML",
                // <-- spread the inlineKeyboard into the options:
                ...Markup.inlineKeyboard([
                    [Markup.button.webApp(
                        "✨ ОТКРЫТЬ СТАВКИ ✨",
                        `${webAppUrl}?ref=${ctx.session.ref || ""}`
                    )],
                    [Markup.button.url(
                        "Отзывы",
                        `https://t.me/purplevibes_reviews`
                    ),
                    Markup.button.url(
                        "Поддержка",
                        `https://t.me/purplevibes_support?text=Здравствуйте! `
                    )
                    ]]),
                message_effect_id: effectIdTwo,
            });
    }
    catch (err) {
        console.error("❌ start handler failed:", err)
        return ctx.reply("Произошла ошибка, попробуйте позже.")
    }
}

async function handleNewUser(ctx) {
    try {
        // ensure session exists
        if (!ctx.session) ctx.session = {}

        // if they launched via deep-link, save it
        const incoming = extractPayload(ctx)
        if (incoming) {
            ctx.session.ref = incoming
            console.log("Saved ref for", ctx.from.id, "=", incoming)
        }
    }
    catch (err) {
        console.error("❌ start handler failed:", err)
        return ctx.reply("Произошла ошибка, попробуйте позже.")
    }
}

bot.command("start", handleStart)
bot.on("text", handleNewUser)

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

bot.launch()

export default bot