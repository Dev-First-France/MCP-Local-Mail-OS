import { createHash } from 'node:crypto';
import { formatSize } from './paths.js';

const formatRecipient = (r) => (r.name ? `${r.name} <${r.address}>` : r.address);
const formatList = (list) => (list && list.length > 0 ? list.map(formatRecipient).join(', ') : '—');

// Caractère de remplacement que Mail insère dans le texte à l'emplacement d'une pièce jointe.
export const cleanBody = (text) => (text || '').replace(/￼/g, '').replace(/\r\n?/g, '\n');

// Empreinte de ce que l'utilisateur a validé : si le brouillon change, l'envoi est refusé.
// Insensible aux espaces : une fois la fenêtre de composition affichée, Mail réécrit le texte
// (lignes vides remplacées par une espace, espace ajoutée en fin de ligne).
export function fingerprint(state) {
  const addresses = (list) => (list || []).map((r) => r.address.trim().toLowerCase()).sort();
  const material = JSON.stringify([
    state.subject || '',
    addresses(state.to),
    addresses(state.cc),
    addresses(state.bcc),
    cleanBody(state.content).replace(/\s+/g, ' ').trim(),
  ]);
  return createHash('sha256').update(material).digest('hex').slice(0, 10);
}

export const makeDraftId = (state) => `${state.outgoing_id}-${fingerprint(state)}`;

export function parseDraftId(draftId) {
  const m = /^(\d+)-([0-9a-f]{10})$/.exec(String(draftId).trim());
  return m ? { outgoingId: Number(m[1]), fingerprint: m[2] } : null;
}

export function renderPreview({ state, attachments = [], title = 'APERÇU DU BROUILLON — NON ENVOYÉ', warnings = [] }) {
  const lines = [
    `=== ${title} ===`,
    `De      : ${state.sender || '—'}`,
    `À       : ${formatList(state.to)}`,
    `Cc      : ${formatList(state.cc)}`,
    `Cci     : ${formatList(state.bcc)}`,
    `Objet   : ${state.subject || '(sans objet)'}`,
  ];
  if (attachments.length === 0) {
    lines.push('Pièces jointes : aucune');
  } else {
    lines.push(`Pièces jointes (${attachments.length}) :`);
    for (const a of attachments) lines.push(`  - ${a.name} (${formatSize(a.size)})`);
  }
  for (const w of warnings) lines.push(`⚠ ${w}`);
  lines.push('-'.repeat(60), cleanBody(state.content).trimEnd() || '(corps vide)', '-'.repeat(60));
  return lines.join('\n');
}
