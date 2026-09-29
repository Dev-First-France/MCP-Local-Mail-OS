// Recherche dans le sujet et l'expéditeur, en masse, sur une liste de cibles (account, mailbox).
// Renvoie aussi les messages récents non trouvés, candidats à la recherche dans le contenu.
// S'arrête avant le timeout et renvoie dans « remaining » les cibles non parcourues.
function main(input, Mail) {
  const q = fold(input.query);
  const matches = [];
  let candidates = [];
  let scanned = 0;
  let totalMatches = 0;
  const searched = [];
  const skipped = [];
  const remaining = [];

  input.targets.forEach(function (target) {
    if (searched.length > 0 && outOfTime(input)) {
      remaining.push(target);
      return;
    }
    const account = getAccount(Mail, target.account);
    const mb = getMailbox(Mail, account, target.mailbox, true);
    if (mb === null) {
      skipped.push({ account: account.name, mailbox: target.mailbox, reason: 'boîte absente de ce compte' });
      return;
    }
    const cols = bulk(mb, [
      function (m) { return m.id(); },
      function (m) { return m.dateReceived(); },
      function (m) { return m.subject(); },
      function (m) { return m.sender(); },
    ]);
    const ids = cols[0], dates = cols[1], subjects = cols[2], senders = cols[3];
    searched.push({ account: account.name, mailbox: mb.path, messages: ids.length });
    scanned += ids.length;

    for (let i = 0; i < ids.length; i++) {
      const inSubject = fold(subjects[i]).indexOf(q) !== -1;
      const inSender = fold(senders[i]).indexOf(q) !== -1;
      const t = dates[i] ? dates[i].getTime() : 0;
      if (inSubject || inSender) {
        const where = [];
        if (inSubject) where.push('subject');
        if (inSender) where.push('sender');
        totalMatches++;
        matches.push({ id: ids[i], account: account.name, mailbox: mb.path, t: t, matched_in: where });
      } else if (input.candidate_limit > 0) {
        candidates.push({ id: ids[i], account: account.name, mailbox: mb.path, t: t });
      }
    }
    // Borne la mémoire : seuls les plus récents peuvent être retenus.
    if (candidates.length > input.candidate_limit * 4) {
      candidates.sort(function (a, b) { return b.t - a.t; });
      candidates = candidates.slice(0, input.candidate_limit);
    }
    if (matches.length > input.match_limit * 4) {
      matches.sort(function (a, b) { return b.t - a.t; });
      matches.length = input.match_limit;
    }
  });

  matches.sort(function (a, b) { return b.t - a.t; });
  candidates.sort(function (a, b) { return b.t - a.t; });
  return {
    searched: searched,
    skipped: skipped,
    remaining: remaining,
    scanned: scanned,
    total_matches: totalMatches,
    matches: matches.slice(0, input.match_limit),
    candidates: candidates.slice(0, input.candidate_limit),
  };
}
