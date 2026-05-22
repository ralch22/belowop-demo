/**
 * Telegram Bot API sender.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN   — from @BotFather
 *   TELEGRAM_CHANNEL_ID  — broadcast channel @username or numeric chat_id
 *
 * For direct-to-user messages, the user must have started the bot first
 * (Telegram doesn't allow bots to message users cold).
 */

const HAS_TOKEN = Boolean(process.env.TELEGRAM_BOT_TOKEN);

export function isTelegramConfigured(): boolean {
  return HAS_TOKEN;
}

/** Escape MarkdownV2 reserved characters per https://core.telegram.org/bots/api#markdownv2-style */
export function escapeMd(s: string): string {
  return s.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

export async function sendTelegram(
  chatId: string,
  text: string,
  opts: { photoUrl?: string; parseMode?: 'MarkdownV2' | 'HTML' } = {},
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  if (!HAS_TOKEN) {
    console.log(`[telegram · stub → ${chatId}]`, text);
    return { ok: true, messageId: 0 };
  }
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const endpoint = opts.photoUrl
    ? `https://api.telegram.org/bot${token}/sendPhoto`
    : `https://api.telegram.org/bot${token}/sendMessage`;
  const body = opts.photoUrl
    ? { chat_id: chatId, photo: opts.photoUrl, caption: text, parse_mode: opts.parseMode ?? 'MarkdownV2' }
    : { chat_id: chatId, text, parse_mode: opts.parseMode ?? 'MarkdownV2' };
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    return { ok: false, error: `Telegram ${resp.status}: ${err.slice(0, 200)}` };
  }
  const data = await resp.json();
  return { ok: true, messageId: data.result?.message_id };
}
