// Crée une réponse avec la commande native de Mail (conserve In-Reply-To / References).
// Expéditeur, sujet, corps et pièces jointes sont écrits ensuite par fill_draft.applescript,
// puis finish_draft enregistre.
function main(input, Mail) {
  const mb = boxOf(Mail, input.source.account, input.source.mailbox);
  // « reply » sur un message d'une boîte de brouillons bloque Mail (constaté sur macOS 27).
  if (isInsidePath(mb.path, specialOf(Mail, mb.account).drafts)) {
    fail('INVALID_ARGUMENT', 'Impossible de répondre à un message de la boîte des brouillons.');
  }
  const src = getMessage(mb, input.source.id);
  const from = getAccount(Mail, input.from_account || mb.account.name);
  const sender = senderFor(from, input.from_address);
  const before = idsIn(draftsBoxOf(Mail, from));

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

  return { outgoing_id: id, from_account: from.name, sender: sender, drafts_before: before };
}
