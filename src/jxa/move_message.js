// Déplace un message vers une boîte EXISTANTE du compte. Sert aussi à la mise à la corbeille.
// Jamais de commande « delete », jamais de création de boîte.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const from = getMailbox(acc, input.from_mailbox);
  const to = getMailbox(acc, input.to_mailbox);
  if (from.path === to.path) {
    fail('INVALID_ARGUMENT', 'Le message est déjà dans la boîte « ' + to.path + ' ».', { mailbox: to.path });
  }
  const msg = getMessage(from, input.id);
  const rfcId = orNull(function () { return msg.messageId(); });
  const subject = orNull(function () { return msg.subject(); }) || '';
  const before = {};
  bulk(to, [function (m) { return m.id(); }])[0].forEach(function (id) { before[id] = true; });

  Mail.move(msg, { to: to.ref });

  // L'id change avec le déplacement : on cherche les nouveaux venus de la boîte cible (ids en masse),
  // puis on confirme par le Message-ID, lu par id. Lire les Message-ID en masse serait trop lent
  // sur une grosse boîte.
  let newId = null;
  let stillInSource = true;
  while (newId === null) {
    delay(0.5);
    const ids = bulk(to, [function (m) { return m.id(); }])[0];
    for (let i = 0; i < ids.length && newId === null; i++) {
      if (before[ids[i]]) continue;
      const candidate = orNull(function () { return to.ref.messages.byId(ids[i]).messageId(); });
      if (rfcId === null || candidate === rfcId) newId = ids[i];
    }
    if (outOfTime(input)) break;
  }
  stillInSource = orNull(function () { return from.ref.messages.byId(input.id).id(); }) !== null;

  return {
    moved: newId !== null || !stillInSource,
    id: input.id,
    subject: subject,
    from: from.path,
    to: to.path,
    new_id: newId,
    still_in_source: stillInSource,
  };
}
