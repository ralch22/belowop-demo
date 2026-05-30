/**
 * Composed notifications used by the lead capture flow and the alerts engine.
 */
import { sendWhatsapp } from './twilio';
import { sendTelegram, escapeMd } from './telegram';

/**
 * Notify Rami when a new lead comes in. Fires WA + TG in parallel.
 *
 * `listingId` is the OPAQUE internal id (u-xxxxxx) — the same id the buyer
 * quotes when they message Jad on WhatsApp. We deliberately surface the opaque
 * id (not the source PF ref) so Jad can cross-reference the buyer's message
 * against this lead notification with one shared identifier. The raw source ref
 * stays server-side (DB / admin) only.
 */
export async function notifyOwnerNewLead(input: {
  name: string;
  phone: string;
  message?: string;
  listingId: string;
  listingProject: string;
  listingPrice: number;
}): Promise<{ wa: { ok: boolean; error?: string }; tg: { ok: boolean; error?: string } }> {
  const body = `New Below OP lead — ${input.name}\nPhone: ${input.phone}\nListing: ${input.listingProject} (${input.listingId})\nPrice: AED ${input.listingPrice.toLocaleString()}\nMessage: ${input.message || '—'}`;
  const tgBody =
    `*New Below OP lead*\n` +
    `*Name:* ${escapeMd(input.name)}\n` +
    `*Phone:* ${escapeMd(input.phone)}\n` +
    `*Listing:* ${escapeMd(input.listingProject)} \\(${escapeMd(input.listingId)}\\)\n` +
    `*Price:* AED ${escapeMd(input.listingPrice.toLocaleString())}\n` +
    `*Message:* ${escapeMd(input.message || '—')}`;

  const owners = {
    wa: process.env.LEADS_NOTIFY_WHATSAPP,
    tg: process.env.LEADS_NOTIFY_TELEGRAM,
  };

  const [wa, tg] = await Promise.all([
    owners.wa ? sendWhatsapp(owners.wa, body) : Promise.resolve({ ok: true as const }),
    owners.tg ? sendTelegram(owners.tg, tgBody) : Promise.resolve({ ok: true as const }),
  ]);
  return { wa, tg };
}
