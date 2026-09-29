// Construction du texte cité pour les réponses et les transferts.

const formatRecipient = (r) => (r.name ? `${r.name} <${r.address}>` : r.address);

export function formatDate(iso) {
  if (!iso) return 'date inconnue';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date inconnue';
  return d.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

// Mail marque l'emplacement des pièces jointes par U+FFFC : sans intérêt dans une citation.
const normalize = (text) =>
  (text || '')
    .replace(/\uFFFC/g, '')
    .replace(/\r\n?|[\u2028\u2029\u0085]/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export function prefixSubject(prefix, subject) {
  const s = (subject || '').trim();
  const pattern = prefix === 'Re' ? /^(re|réf)\s*:/i : /^(fwd?|tr|transf)\s*:/i;
  return pattern.test(s) ? s : `${prefix}: ${s}`;
}

export function replyBody(body, original) {
  const quoted = normalize(original.body)
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
  return `${(body || '').trimEnd()}\n\nLe ${formatDate(original.date_sent || original.date_received)}, ${original.sender} a écrit :\n\n${quoted}\n`;
}

export function forwardBody(body, original) {
  const header = [
    'Début du message réexpédié :',
    '',
    `De : ${original.sender}`,
    `Objet : ${original.subject}`,
    `Date : ${formatDate(original.date_sent || original.date_received)}`,
  ];
  if (original.to?.length) header.push(`À : ${original.to.map(formatRecipient).join(', ')}`);
  if (original.cc?.length) header.push(`Cc : ${original.cc.map(formatRecipient).join(', ')}`);
  const intro = (body || '').trimEnd();
  return `${intro ? `${intro}\n\n` : ''}${header.join('\n')}\n\n${normalize(original.body)}\n`;
}
