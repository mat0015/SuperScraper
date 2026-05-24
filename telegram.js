import TelegramBot from "node-telegram-bot-api";

const TOKEN = "8735833630:AAEW_6PvsjYvfWXPYnY9gMiLTW-niBfh7fg";
const CHAT_ID = "5108787819";

const bot = new TelegramBot(TOKEN);

export async function enviarTelegram(mensaje){

    try {

        await bot.sendMessage(
            CHAT_ID,
            mensaje
        );

    } catch(err){

        console.log(
            "Error Telegram"
        );
    }
}