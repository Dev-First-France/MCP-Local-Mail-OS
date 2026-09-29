// Détails de messages désignés par (mailbox, id).
// S'arrête avant le timeout et renvoie dans « remaining » ce qui reste à traiter.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const boxes = {};
  const out = [];
  const missing = [];
  const remaining = [];
  input.items.forEach(function (item) {
    if (out.length + missing.length > 0 && outOfTime(input)) {
      remaining.push(item);
      return;
    }
    if (!boxes[item.mailbox]) boxes[item.mailbox] = getMailbox(acc, item.mailbox);
    const mb = boxes[item.mailbox];
    try {
      out.push(summaryOf(mb.ref.messages.byId(item.id), item.id, mb.path));
    } catch (e) {
      missing.push({ id: item.id, mailbox: mb.path });
    }
  });
  return { messages: out, missing: missing, remaining: remaining };
}
