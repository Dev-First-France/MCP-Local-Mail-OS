// Détails de messages désignés par (account, mailbox, id).
// S'arrête avant le timeout et renvoie dans « remaining » ce qui reste à traiter.
function main(input, Mail) {
  const out = [];
  const missing = [];
  const remaining = [];
  input.items.forEach(function (item) {
    if (out.length + missing.length > 0 && outOfTime(input)) {
      remaining.push(item);
      return;
    }
    const mb = boxOf(Mail, item.account, item.mailbox);
    try {
      out.push(summaryOf(mb.ref.messages.byId(item.id), item.id, mb));
    } catch (e) {
      missing.push({ id: item.id, account: mb.account.name, mailbox: mb.path });
    }
  });
  return { messages: out, missing: missing, remaining: remaining };
}
