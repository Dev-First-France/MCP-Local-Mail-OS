// Déplace un message vers une boîte EXISTANTE, du même compte ou d'un autre.
// Sert aussi à la mise à la corbeille (to_role = "trash" : corbeille du compte du message).
// Jamais de commande « delete », jamais de création de boîte.
function main(input, Mail) {
  const from = boxOf(Mail, input.account, input.from_mailbox);
  const special = specialOf(Mail, from.account);

  let to;
  if (input.to_role === 'trash') {
    if (special.trash === null) {
      fail('MAILBOX_NOT_FOUND', 'Corbeille introuvable pour le compte ' + from.account.name + '.', { account: from.account.name });
    }
    if (isInsidePath(from.path, special.trash)) {
      fail('INVALID_ARGUMENT', 'Ce message est déjà dans la corbeille. Ce serveur ne supprime jamais définitivement un message et ne vide jamais la corbeille.');
    }
    to = getMailbox(Mail, from.account, special.trash);
  } else {
    to = boxOf(Mail, input.to_account || from.account.name, input.to_mailbox);
  }
  if (from.account.id === to.account.id && from.path === to.path) {
    fail('INVALID_ARGUMENT', 'Le message est déjà dans la boîte « ' + to.path + ' ».', { account: to.account.name, mailbox: to.path });
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
  const stillInSource = orNull(function () { return from.ref.messages.byId(input.id).id(); }) !== null;

  return {
    moved: newId !== null || !stillInSource,
    id: input.id,
    subject: subject,
    from_account: from.account.name,
    from: from.path,
    to_account: to.account.name,
    to: to.path,
    new_id: newId,
    still_in_source: stillInSource,
  };
}
