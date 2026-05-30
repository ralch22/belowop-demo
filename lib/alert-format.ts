/**
 * Broker canonical alert template (Variables.pdf).
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

/**
 * "Project, Area" line per the broker PDF template. We use community as the
 * Area, dedupe if community is already mentioned in the project name (so we
 * don't render "Viewz 2 by Danube, Viewz 2 by Danube").
 */
function locationLine(ctx: AlertContext): string {
  const project = ctx.project.trim();
  const community = ctx.community.trim();
  if (!community || project.toLowerCase().includes(community.toLowerCase())) return project;
  return `${project}, ${community}`;
}

export function brokerWhatsappNumber(): string {
  // Jad's direct WhatsApp (the broker buyers should reach). Overridable via env,
  // but defaults to the real number so alerts never ship a placeholder.
  const raw = process.env.BROKER_WHATSAPP_DIRECT?.replace(/^\+/, '').trim();
  return raw && raw.length > 0 ? raw : '971585276222';
}

function bullets(ctx: AlertContext): string[] {
  const sqm = Math.round(ctx.sqft * 0.092903);
  const out: string[] = [];
  out.push(ctx.unitType ? `*${ctx.unitType}*` : `*${ctx.beds === 'studio' ? 'Studio' : `${ctx.beds} Bedroom`}*`);
  if (ctx.bathrooms && ctx.bathrooms > 0) out.push(`*${ctx.bathrooms} Bathroom${ctx.bathrooms > 1 ? 's' : ''}*`);
  out.push(`~*${ctx.sqft.toLocaleString()} sqft*~ | ~*${sqm.toLocaleString()} sqm*~`);
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
  lines.push(`🔴 *DISTRESS DEAL - Below OP* 🔴`);
  lines.push('');
  lines.push(`📍 *${locationLine(ctx)}*`);
  lines.push('');
  for (const b of bullets(ctx)) lines.push(`• ${b}`);
  lines.push('');
  if (ctx.handover && ctx.type === 'off_plan') lines.push(`*Handover*: ${ctx.handover}`);
  if (ctx.paymentStatus) lines.push(`*Payment*: ${ctx.paymentStatus}`);
  if (ctx.developer) lines.push(`*Developer*: *${ctx.developer}*`);
  lines.push('');
  lines.push(`*Selling Price*: *${formatAedShort(ctx.current)} AED* | ${formatUsdShort(ctx.current)} 🔥`);
  if (ctx.dropPct) lines.push(`📉 ${Math.abs(ctx.dropPct).toFixed(0)}% below OP (was ${formatAedShort(ctx.original)} AED)`);
  lines.push('');
  lines.push(`For serious inquiries contact:`);
  lines.push(`Wa.me/${brokerWhatsappNumber()}`);
  lines.push(`See all units → ${ctx.webUrl}`);
  return lines.join('\n');
}

export function formatTelegram(ctx: AlertContext): string {
  const e = escapeMd;
  const sqm = Math.round(ctx.sqft * 0.092903);
  const lines: string[] = [];
  lines.push(`🔴 *DISTRESS DEAL \\- Below OP* 🔴`);
  lines.push('');
  lines.push(`📍 *${e(locationLine(ctx))}*`);
  lines.push('');
  if (ctx.unitType) lines.push(`• *${e(ctx.unitType)}*`);
  else lines.push(`• *${ctx.beds === 'studio' ? 'Studio' : `${e(ctx.beds)} Bedroom`}*`);
  if (ctx.bathrooms) lines.push(`• *${ctx.bathrooms} Bathroom${ctx.bathrooms > 1 ? 's' : ''}*`);
  lines.push(`• ~${e(`${ctx.sqft.toLocaleString()} sqft`)}~ \\| ~${e(`${sqm.toLocaleString()} sqm`)}~`);
  const feats = ctx.features.slice(0, 5);
  if (feats.length >= 2) lines.push(`• *${e(feats[0])}* \\| *${e(feats[1])}*`);
  for (const f of feats.slice(2, 5)) lines.push(`• *${e(f)}*`);
  lines.push('');
  if (ctx.handover && ctx.type === 'off_plan') lines.push(`*Handover*: ${e(ctx.handover)}`);
  if (ctx.paymentStatus) lines.push(`*Payment*: ${e(ctx.paymentStatus)}`);
  if (ctx.developer) lines.push(`*Developer*: *${e(ctx.developer)}*`);
  lines.push('');
  lines.push(`*Selling Price*: *${e(formatAedShort(ctx.current) + ' AED')}* \\| ${e(formatUsdShort(ctx.current))} 🔥`);
  if (ctx.dropPct) lines.push(`📉 ${Math.abs(ctx.dropPct).toFixed(0)}% below OP \\(was ${e(formatAedShort(ctx.original) + ' AED')}\\)`);
  lines.push('');
  lines.push(`For serious inquiries: [WhatsApp Jad](https://wa.me/${brokerWhatsappNumber()})`);
  lines.push(`[See all units](${ctx.webUrl})`);
  return lines.join('\n');
}
