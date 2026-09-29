// Crée une réponse avec la commande native de Mail (conserve In-Reply-To / References).
// Le corps est écrit ensuite par fill_draft.applescript, puis finish_draft enregistre.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const mb = getMailbox(acc, input.source.mailbox);
  // « reply » sur un message de la boîte Drafts bloque Mail (constaté sur macOS 27).
  if (mb.path === input.drafts_mailbox || mb.path.indexOf(input.drafts_mailbox + '/') === 0) {
    fail('INVALID_ARGUMENT', 'Impossible de répondre à un message de la boîte ' + input.drafts_mailbox + '.');
  }
  const src = getMessage(mb, input.source.id);
  const before = Object.keys(draftIds(acc, input).seen).map(Number);

  const msg = src.reply({ openingWindow: input.visible, replyToAll: false });
  delay(1);
  const id = msg.id();

  // Destinataires fournis : ils remplacent ceux que Mail a proposés.
  const wanted = (input.to || []).map(function (r) { return r.address.toLowerCase(); });
  if (wanted.length > 0) {
    const current = orNull(function () { return msg.toRecipients.address(); }) || [];
    for (let i = current.length - 1; i >= 0; i--) {
      if (wanted.indexOf(String(current[i]).toLowerCase()) === -1) {
        try { Mail.delete(msg.toRecipients[i]); } catch (e) {}
      }
    }
    const kept = (orNull(function () { return msg.toRecipients.address(); }) || []).map(function (a) { return String(a).toLowerCase(); });
    input.to = input.to.filter(function (r) { return kept.indexOf(r.address.toLowerCase()) === -1; });
  }
  setRecipients(Mail, msg, input);

  return { outgoing_id: id, drafts_before: before, source_mailbox: mb.path };
}
