// Messages les plus récents d'une boîte.
// Sélection : ids et dates en masse, tri en JS (jamais d'accès par index ni de « whose »).
// Détails : en masse pour une petite boîte, par id pour une grosse.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const mb = getMailbox(acc, input.mailbox);
  const getters = [
    function (m) { return m.id(); },
    function (m) { return m.dateReceived(); },
  ];
  if (input.unread_only) getters.push(function (m) { return m.readStatus(); });
  const cols = bulk(mb, getters);
  const ids = cols[0];
  const dates = cols[1];
  const reads = cols[2];

  let idx = ids.map(function (_, i) { return i; });
  if (input.unread_only) idx = idx.filter(function (i) { return reads[i] === false; });
  const matching = idx.length;
  idx.sort(function (a, b) { return dates[b] - dates[a]; });
  idx = idx.slice(0, input.limit);

  const messages = [];
  const remaining = [];
  let rows = null;
  if (ids.length <= input.bulk_threshold && idx.length > 0) {
    const more = bulk(mb, [
      function (m) { return m.id(); },
      function (m) { return m.subject(); },
      function (m) { return m.sender(); },
      function (m) { return m.readStatus(); },
      function (m) { return m.flaggedStatus(); },
    ]);
    // Les colonnes ne sont exploitables que si la boîte n'a pas bougé depuis la sélection.
    if (more[0].length === ids.length && idx.every(function (i) { return more[0][i] === ids[i]; })) rows = more;
  }

  idx.forEach(function (i) {
    const id = ids[i];
    if (messages.length > 0 && outOfTime(input)) {
      remaining.push({ id: id, mailbox: mb.path });
      return;
    }
    const msg = mb.ref.messages.byId(id);
    try {
      if (rows) {
        messages.push({
          id: id,
          mailbox: mb.path,
          subject: rows[1][i] || '',
          sender: rows[2][i] || '',
          date: iso(dates[i]),
          read: rows[3][i],
          flagged: rows[4][i],
          has_attachments: msg.mailAttachments.length > 0,
        });
      } else {
        messages.push(summaryOf(msg, id, mb.path));
      }
    } catch (e) {}
  });

  return { mailbox: mb.path, total: ids.length, matching: matching, messages: messages, remaining: remaining };
}
