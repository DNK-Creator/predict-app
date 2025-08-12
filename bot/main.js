import fetch from 'node-fetch'
import { Telegraf, Markup, session } from "telegraf"
import 'dotenv/config'
import express from "express"
import cors from "cors"

const token = process.env.BOT_TOKEN
const bot = new Telegraf(token)
// install session middleware
bot.use(session())

const effectIdTwo = "5046509860389126442"

const app = express()
app.use(express.json())
// 2) Enable CORS *only* from your front-end domain
app.use(cors({
    origin: 'https://giftspredict.ru',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}))


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
            { url: "https://gybesttgrbhaakncfagj.supabase.co/storage/v1/object/public/holidays-images/Horizontal_Banner.png" },
            {
                caption: "Ты попал в <b>Gifts Predict! 🔮 </b> Предсказывай всевозможные события в Телеграме и зарабатывай призы!",
                parse_mode: "HTML",
                // <-- spread the inlineKeyboard into the options:
                ...Markup.inlineKeyboard([
                    [Markup.button.url(
                        "🕹️ Открыть приложение",
                        `https://t.me/giftspredict_bot?startapp=${ctx.session.ref || ""}`
                    )],
                    [Markup.button.url(
                        "📢 Комьюнити",
                        `https://t.me/giftspredict`
                    )]
                ]),
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