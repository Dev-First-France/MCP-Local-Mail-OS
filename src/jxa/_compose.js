// Helpers de composition, ajoutés après le prélude pour les opérations de brouillon.

function recipientsOf(list) {
  const addresses = orNull(function () { return list.address(); }) || [];
  const names = orNull(function () { return list.name(); }) || [];
  return addresses.map(function (address, i) {
    return { name: names[i] || null, address: address };
  });
}

function senderFor(acc) {
  const addresses = acc.emailAddresses();
  if (!addresses || addresses.length === 0) {
    fail('ACCOUNT_NOT_FOUND', 'Le compte ' + acc.name() + ' n\'a aucune adresse d\'expédition.');
  }
  const fullName = orNull(function () { return acc.fullName(); });
  return fullName ? fullName + ' <' + addresses[0] + '>' : addresses[0];
}

function outgoingById(Mail, id) {
  const ids = orNull(function () { return Mail.outgoingMessages.id(); }) || [];
  if (ids.indexOf(id) === -1) {
    fail(
      'DRAFT_NOT_FOUND',
      'Brouillon ' + id + ' introuvable parmi les messages en cours de composition. Il a pu être envoyé, fermé, ou Mail a été relancé. ' +
        'S\'il figure encore dans la boîte Drafts, envoyez-le depuis Mail ; sinon recréez-le avec draft_email.',
      { open_drafts: ids },
    );
  }
  return Mail.outgoingMessages.byId(id);
}

function stateOf(msg, id) {
  return {
    outgoing_id: id,
    visible: orNull(function () { return msg.visible(); }),
    sender: orNull(function () { return msg.sender(); }) || '',
    subject: orNull(function () { return msg.subject(); }) || '',
    to: recipientsOf(msg.toRecipients),
    cc: recipientsOf(msg.ccRecipients),
    bcc: recipientsOf(msg.bccRecipients),
    content: orNull(function () { return msg.content(); }) || '',
  };
}

function setRecipients(Mail, msg, input) {
  const kinds = [
    { key: 'to', list: msg.toRecipients, make: function (p) { return Mail.ToRecipient(p); } },
    { key: 'cc', list: msg.ccRecipients, make: function (p) { return Mail.CcRecipient(p); } },
    { key: 'bcc', list: msg.bccRecipients, make: function (p) { return Mail.BccRecipient(p); } },
  ];
  kinds.forEach(function (kind) {
    (input[kind.key] || []).forEach(function (r) {
      const props = { address: r.address };
      if (r.name) props.name = r.name;
      kind.list.push(kind.make(props));
    });
  });
}

function draftIds(acc, input) {
  const drafts = getMailbox(acc, input.drafts_mailbox);
  const seen = {};
  bulk(drafts, [function (m) { return m.id(); }])[0].forEach(function (id) { seen[id] = true; });
  return { box: drafts, seen: seen };
}

// Retrouve la copie enregistrée dans Drafts : nouvelle venue portant le même sujet.
// C'est sur elle que l'on vérifie les pièces jointes (illisibles sur le message en composition).
function waitForDraftCopy(before, subject, expectedAttachments, input) {
  let found = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    delay(0.5);
    const cols = bulk(before.box, [function (m) { return m.id(); }, function (m) { return m.subject(); }]);
    let candidate = null;
    for (let i = 0; i < cols[0].length; i++) {
      if (!before.seen[cols[0][i]] && cols[1][i] === subject) candidate = cols[0][i];
    }
    if (candidate !== null) {
      const copy = before.box.ref.messages.byId(candidate);
      const names = orNull(function () { return copy.mailAttachments.name(); }) || [];
      const sizes = orNull(function () { return copy.mailAttachments.fileSize(); }) || [];
      found = {
        id: candidate,
        mailbox: before.box.path,
        attachments: names.map(function (n, i) { return { name: n, size: sizes[i] === undefined ? null : sizes[i] }; }),
      };
      if (names.length >= expectedAttachments) return found;
    }
    if (outOfTime(input)) break;
  }
  return found;
}
