// Fonctions pures sur les fiches de Contacts (aucun appel à osascript).

// Comparaison insensible à la casse et aux accents.
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Les libellés standard d'Apple ont la forme « _$!<Work>!$_ » ; les libellés personnalisés sont du texte libre.
export function cleanLabel(label) {
  if (typeof label !== 'string' || label.trim() === '') return null;
  const standard = label.match(/^_\$!<(.+)>!\$_$/);
  return standard ? standard[1].toLowerCase() : label.trim();
}

function cleanEmails(emails) {
  const seen = new Set();
  const out = [];
  for (const { address, label } of emails || []) {
    const value = typeof address === 'string' ? address.trim() : '';
    if (value === '' || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push({ address: value, label: cleanLabel(label) });
  }
  return out;
}

/**
 * Fiches dont le nom, le surnom, l'organisation ou une adresse contient tous les mots de la recherche.
 * Seules les fiches ayant une adresse sont renvoyées ; les autres sont comptées dans `without_email`.
 */
export function matchContacts(contacts, query, limit) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const found = [];
  let withoutEmail = 0;
  for (const c of contacts) {
    const emails = cleanEmails(c.emails);
    const haystack = fold([c.name, c.nickname, c.organization, ...emails.map((e) => e.address)].filter(Boolean).join(' '));
    if (words.length === 0 || !words.every((w) => haystack.includes(w))) continue;
    if (emails.length === 0) {
      withoutEmail++;
      continue;
    }
    const contact = { name: c.name || c.organization || '' };
    if (c.nickname) contact.nickname = c.nickname;
    if (c.organization && c.organization !== contact.name) contact.organization = c.organization;
    contact.emails = emails;
    found.push(contact);
  }
  found.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  const returned = found.slice(0, limit);
  return {
    query,
    contacts_searched: contacts.length,
    total_matches: found.length,
    returned: returned.length,
    truncated: found.length > returned.length,
    without_email: withoutEmail,
    contacts: returned,
  };
}
