/**
 * Broker canonical alert template.
 *
 * Aligned to the "Below OP" WhatsApp content spec:
 *   - Header:   🔴 *DISTRESS DEAL - BELOW OP* 🔴   (BELOW OP uppercase)
 *   - Location: themed emoji + bold project (📍 fallback)
 *   - Size:     ~XXXX sqft BUA  (literal ~ = "approx", + Plot when present)
 *   - Price:    Selling Price: XX.XM Ð | $X.XXM 🔥  (Ð glyph, not "AED")
 *   - Discount: strikethrough ~Original Price: XX.XM Ð~
 *   - Footer:   direct WhatsApp + community group + deals channel
 *
 * Used by /api/alerts/dispatch for real sends and /api/admin/preview-alert
 * for QA. Same code path, no drift.
 */
import { escapeMd } from './telegram';
import { formatAedShort, formatUsdShort } from './description-parser';

export interface AlertContext {
  project: string;
  community: string;
  subLocation: string | null;
  unitType: string | null;
  beds: string;
  bathrooms: number | null;
  sqft: number;
  /** Built-up area (villas). Falls back to `sqft` when null. */
  buaSqft: number | null;
  /** Plot size (villas). Rendered as a second size token when present. */
  plotSqft: number | null;
  features: string[];
  view: string | null;
  floorPosition: string | null;
  handover: string | null;
  paymentStatus: string | null;
  developer: string | null;
  type: 'off_plan' | 'ready';
  current: number;
  original: number;
  dropPct: number;
  webUrl: string;
}

// Brand links from the WhatsApp content spec. These are the exact short links
// the content team uses across every post, so they're pinned here (not read
// from env) to keep the alert footer deterministic and on-spec.
const COMMUNITY_LINK = 'https://bit.ly/Dubaipropertydeals';
const CHANNEL_LINK = 'https://bit.ly/DubaiPropertyDealsChannel';

/** True only for a genuine below-OP discount (real, positive original < current). */
function hasDiscount(ctx: AlertContext): boolean {
  return ctx.original > 0 && ctx.original > ctx.current;
}

/**
 * "Project, Area" line per the broker template. We use community as the Area,
 * dedupe if community is already mentioned in the project name (so we don't
 * render "Viewz 2 by Danube, Viewz 2 by Danube").
 */
function locationLine(ctx: AlertContext): string {
  const project = ctx.project.trim();
  const community = ctx.community.trim();
  if (!community || project.toLowerCase().includes(community.toLowerCase())) return project;
  return `${project}, ${community}`;
}

/**
 * Themed location emoji per the spec ("relevant emoji + bold project name").
 * Conservative keyword match on project/community/sub-location; falls back to
 * the neutral 📍 pin when nothing strongly matches, so we never ship a
 * misleading icon.
 */
function locationEmoji(ctx: AlertContext): string {
  const hay = `${ctx.project} ${ctx.community} ${ctx.subLocation ?? ''}`.toLowerCase();
  const map: [RegExp, string][] = [
    [/\b(equestrian|equiterra|polo|stud|stables?)\b/, '🏇'],
    [/\b(golf|fairway|emerald hills|els club|montgomerie)\b/, '⛳'],
    [/\b(beach|marina|waterfront|water|island|harbour|harbor|creek|lagoon|seafront|cove|\bbay)\b/, '🌊'],
    [/\bpalm\b/, '🌴'],
    [/\b(hills?|park|greens?|forest|valley|meadows?|grove|gardens?)\b/, '🌳'],
    [/\b(downtown|burj|boulevard|business bay|difc)\b/, '🏙️'],
  ];
  for (const [re, emoji] of map) if (re.test(hay)) return emoji;
  return '📍';
}

export function brokerWhatsappNumber(): string {
  // Jad's direct WhatsApp (the broker buyers should reach). Overridable via env,
  // but defaults to the real number so alerts never ship a placeholder.
  const raw = process.env.BROKER_WHATSAPP_DIRECT?.replace(/^\+/, '').trim();
  return raw && raw.length > 0 ? raw : '971585276222';
}

/** BUA figure for the size line — prefer the dedicated BUA column, else sqft. */
function buaFigure(ctx: AlertContext): number {
  return ctx.buaSqft && ctx.buaSqft > 0 ? ctx.buaSqft : ctx.sqft;
}

function bullets(ctx: AlertContext): string[] {
  const out: string[] = [];
  out.push(ctx.unitType ? `*${ctx.unitType}*` : `*${ctx.beds === 'studio' ? 'Studio' : `${ctx.beds} Bedroom`}*`);
  if (ctx.bathrooms && ctx.bathrooms > 0) out.push(`*${ctx.bathrooms} Bathroom${ctx.bathrooms > 1 ? 's' : ''}*`);
  // Size: leading "~" is a literal "approximately" (not strikethrough), label
  // BUA, no sqm. Append plot size for villas when we have it.
  const sizeTokens = [`*~${buaFigure(ctx).toLocaleString()} sqft BUA*`];
  if (ctx.plotSqft && ctx.plotSqft > 0) sizeTokens.push(`*~${ctx.plotSqft.toLocaleString()} sqft Plot*`);
  out.push(sizeTokens.join(' | '));
  const featLines = ctx.features.slice(0, 5);
  if (featLines.length >= 2) {
    out.push(`*${featLines[0]}* | *${featLines[1]}*`);
    for (const f of featLines.slice(2, 5)) out.push(`*${f}*`);
  } else if (featLines.length === 1) {
    out.push(`*${featLines[0]}*`);
  }
  return out;
}

export function formatWhatsapp(ctx: AlertContext): string {
  const lines: string[] = [];
  lines.push(`🔴 *DISTRESS DEAL - BELOW OP* 🔴`);
  lines.push('');
  lines.push(`${locationEmoji(ctx)} *${locationLine(ctx)}*`);
  lines.push('');
  for (const b of bullets(ctx)) lines.push(`• ${b}`);
  lines.push('');
  if (ctx.handover && ctx.type === 'off_plan') lines.push(`*Handover*: ${ctx.handover}`);
  if (ctx.paymentStatus) lines.push(`*Payment*: ${ctx.paymentStatus}`);
  if (ctx.developer) lines.push(`*Developer*: *${ctx.developer}*`);
  lines.push('');
  if (hasDiscount(ctx)) lines.push(`~Original Price: ${formatAedShort(ctx.original)} Ð~`);
  lines.push(`*Selling Price*: *${formatAedShort(ctx.current)} Ð* | ${formatUsdShort(ctx.current)} 🔥`);
  lines.push('');
  lines.push(`For serious inquiries contact:`);
  lines.push(`Wa.me/+${brokerWhatsappNumber()}`);
  lines.push('');
  lines.push(`Join our WhatsApp community to stay up to date:`);
  lines.push(COMMUNITY_LINK);
  lines.push('');
  lines.push(`Join our WhatsApp channel to see all available deals:`);
  lines.push(CHANNEL_LINK);
  return lines.join('\n');
}

export function formatTelegram(ctx: AlertContext): string {
  const e = escapeMd;
  const lines: string[] = [];
  lines.push(`🔴 *DISTRESS DEAL \\- BELOW OP* 🔴`);
  lines.push('');
  lines.push(`${locationEmoji(ctx)} *${e(locationLine(ctx))}*`);
  lines.push('');
  if (ctx.unitType) lines.push(`• *${e(ctx.unitType)}*`);
  else lines.push(`• *${ctx.beds === 'studio' ? 'Studio' : `${e(ctx.beds)} Bedroom`}*`);
  if (ctx.bathrooms) lines.push(`• *${ctx.bathrooms} Bathroom${ctx.bathrooms > 1 ? 's' : ''}*`);
  const sizeTokens = [`*${e(`~${buaFigure(ctx).toLocaleString()} sqft BUA`)}*`];
  if (ctx.plotSqft && ctx.plotSqft > 0) sizeTokens.push(`*${e(`~${ctx.plotSqft.toLocaleString()} sqft Plot`)}*`);
  lines.push(`• ${sizeTokens.join(' \\| ')}`);
  const feats = ctx.features.slice(0, 5);
  if (feats.length >= 2) lines.push(`• *${e(feats[0])}* \\| *${e(feats[1])}*`);
  for (const f of feats.slice(2, 5)) lines.push(`• *${e(f)}*`);
  lines.push('');
  if (ctx.handover && ctx.type === 'off_plan') lines.push(`*Handover*: ${e(ctx.handover)}`);
  if (ctx.paymentStatus) lines.push(`*Payment*: ${e(ctx.paymentStatus)}`);
  if (ctx.developer) lines.push(`*Developer*: *${e(ctx.developer)}*`);
  lines.push('');
  if (hasDiscount(ctx)) lines.push(`~${e(`Original Price: ${formatAedShort(ctx.original)} Ð`)}~`);
  lines.push(`*Selling Price*: *${e(`${formatAedShort(ctx.current)} Ð`)}* \\| ${e(formatUsdShort(ctx.current))} 🔥`);
  lines.push('');
  lines.push(`For serious inquiries contact:`);
  lines.push(`[${e(`Wa.me/+${brokerWhatsappNumber()}`)}](https://wa.me/${brokerWhatsappNumber()})`);
  lines.push('');
  lines.push(`Join our WhatsApp community to stay up to date:`);
  lines.push(`[${e(COMMUNITY_LINK.replace(/^https?:\/\//, ''))}](${COMMUNITY_LINK})`);
  lines.push('');
  lines.push(`Join our WhatsApp channel to see all available deals:`);
  lines.push(`[${e(CHANNEL_LINK.replace(/^https?:\/\//, ''))}](${CHANNEL_LINK})`);
  return lines.join('\n');
}
