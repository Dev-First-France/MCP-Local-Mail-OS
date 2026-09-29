// Recherche dans le sujet et l'expéditeur, en masse, sur une ou plusieurs boîtes.
// Renvoie aussi les messages récents non trouvés, candidats à la recherche dans le contenu.
// S'arrête avant le timeout et renvoie dans « remaining_mailboxes » les boîtes non parcourues.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const q = fold(input.query);
  const matches = [];
  let candidates = [];
  let scanned = 0;
  const searched = [];
  const remaining = [];

  input.mailboxes.forEach(function (wanted) {
    if (searched.length > 0 && outOfTime(input)) {
      remaining.push(wanted);
      return;
    }
    const mb = getMailbox(acc, wanted);
    const cols = bulk(mb, [
      function (m) { return m.id(); },
      function (m) { return m.dateReceived(); },
      function (m) { return m.subject(); },
      function (m) { return m.sender(); },
    ]);
    const ids = cols[0], dates = cols[1], subjects = cols[2], senders = cols[3];
    searched.push(mb.path);
    scanned += ids.length;

    for (let i = 0; i < ids.length; i++) {
      const inSubject = fold(subjects[i]).indexOf(q) !== -1;
      const inSender = fold(senders[i]).indexOf(q) !== -1;
      const t = dates[i] ? dates[i].getTime() : 0;
      if (inSubject || inSender) {
        const where = [];
        if (inSubject) where.push('subject');
        if (inSender) where.push('sender');
        matches.push({ id: ids[i], mailbox: mb.path, t: t, matched_in: where });
      } else if (input.candidate_limit > 0) {
        candidates.push({ id: ids[i], mailbox: mb.path, t: t });
      }
    }
    // Borne la mémoire : seuls les plus récents peuvent être retenus.
    if (candidates.length > input.candidate_limit * 4) {
      candidates.sort(function (a, b) { return b.t - a.t; });
      candidates = candidates.slice(0, input.candidate_limit);
    }
  });

  matches.sort(function (a, b) { return b.t - a.t; });
  candidates.sort(function (a, b) { return b.t - a.t; });
  return {
    searched_mailboxes: searched,
    remaining_mailboxes: remaining,
    scanned: scanned,
    total_matches: matches.length,
    matches: matches.slice(0, input.match_limit),
    candidates: candidates.slice(0, input.candidate_limit),
  };
}
