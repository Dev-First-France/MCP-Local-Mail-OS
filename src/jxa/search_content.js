// Recherche dans le corps d'une liste bornée de messages désignés par (account, mailbox, id).
// S'arrête avant le timeout et renvoie dans « remaining » ce qui reste à traiter.
function main(input, Mail) {
  const q = fold(input.query);
  const hits = [];
  const remaining = [];
  let scanned = 0;
  input.items.forEach(function (item) {
    if (scanned > 0 && outOfTime(input)) {
      remaining.push(item);
      return;
    }
    const mb = boxOf(Mail, item.account, item.mailbox);
    scanned++;
    const body = orNull(function () { return mb.ref.messages.byId(item.id).content(); });
    if (body !== null && fold(body).indexOf(q) !== -1) {
      hits.push({ id: item.id, account: mb.account.name, mailbox: mb.path, t: item.t, matched_in: ['content'] });
    }
  });
  return { scanned: scanned, hits: hits, remaining: remaining };
}
