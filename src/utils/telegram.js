export async function sendTelegramNotification(message) {
    const botToken = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
    const chatId = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
        console.warn('Telegram credentials not configured');
        return;
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();

        if (!data.ok) {
            console.error('Telegram API error:', data);
        }

        return data;
    } catch (error) {
        console.error('Telegram notification error:', error);
    }
}

export function formatOrderNotification(order) {
    return `
🔔 <b>Yangi buyurtma!</b>

👤 Mijoz: ${order.mijoz}
📦 Mahsulot: ${order.mahsulot}
🔢 Miqdor: ${order.miqdor}
💰 Summa: ${order.summa.toLocaleString()} so'm
📅 Sana: ${order.sana}
⚡ Status: ${order.status}
  `.trim();
}