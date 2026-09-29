// Helpers de composition, ajoutés après le prélude pour les opérations de brouillon.

function recipientsOf(list) {
  const addresses = orNull(function () { return list.address(); }) || [];
  const names = orNull(function () { return list.name(); }) || [];
  return addresses.map(function (address, i) {
    return { name: names[i] || null, address: address };
  });
}

// Expéditeur : toujours une adresse du compte demandé. Sans expéditeur explicite, Mail prendrait
// son compte par défaut et le brouillon atterrirait dans les brouillons d'un autre compte.
function senderFor(account, fromAddress) {
  const addresses = orNull(function () { return account.ref.emailAddresses(); }) || [];
  if (addresses.length === 0) {
    fail('ACCOUNT_NOT_FOUND', 'Le compte ' + account.name + ' n\'a aucune adresse d\'expédition.');
  }
  let address = addresses[0];
  if (fromAddress) {
    const hit = addresses.filter(function (a) { return looseKey(a) === looseKey(fromAddress); });
    if (hit.length === 0) {
      fail('INVALID_ARGUMENT', 'L\'adresse ' + fromAddress + ' n\'appartient pas au compte ' + account.name + '.', { account: account.name, addresses: addresses });
    }
    address = hit[0];
  }
  const fullName = orNull(function () { return account.ref.fullName(); });
  return fullName ? fullName + ' <' + address + '>' : address;
}

function draftsBoxOf(Mail, account) {
  const path = specialOf(Mail, account).drafts;
  if (path === null) {
    fail('MAILBOX_NOT_FOUND', 'Boîte des brouillons introuvable pour le compte ' + account.name + '.', { account: account.name });
  }
  return getMailbox(Mail, account, path);
}

function outgoingById(Mail, id) {
  const ids = orNull(function () { return Mail.outgoingMessages.id(); }) || [];
  if (ids.indexOf(id) === -1) {
    fail(
      'DRAFT_NOT_FOUND',
      'Brouillon ' + id + ' introuvable parmi les messages en cours de composition. Il a pu être envoyé, fermé, ou Mail a été relancé. ' +
        'S\'il figure encore dans la boîte des brouillons, envoyez-le depuis Mail ; sinon recréez-le avec draft_email.',
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

function idsIn(box) {
  return bulk(box, [function (m) { return m.id(); }])[0];
}

// Retrouve la copie enregistrée dans les brouillons du compte : nouvelle venue portant le même sujet.
// C'est sur elle que l'on vérifie les pièces jointes (illisibles sur le message en composition).
function waitForDraftCopy(box, beforeIds, subject, expectedAttachments, input) {
  const seen = {};
  beforeIds.forEach(function (id) { seen[id] = true; });
  let found = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    delay(0.5);
    const cols = bulk(box, [function (m) { return m.id(); }, function (m) { return m.subject(); }]);
    let candidate = null;
    for (let i = 0; i < cols[0].length; i++) {
      if (!seen[cols[0][i]] && cols[1][i] === subject) candidate = cols[0][i];
    }
    if (candidate !== null) {
      const copy = box.ref.messages.byId(candidate);
      const names = orNull(function () { return copy.mailAttachments.name(); }) || [];
      const sizes = orNull(function () { return copy.mailAttachments.fileSize(); }) || [];
      const headers = orNull(function () { return copy.allHeaders(); }) || '';
      found = {
        id: candidate,
        account: box.account.name,
        mailbox: box.path,
        attachments: names.map(function (n, i) { return { name: n, size: sizes[i] === undefined ? null : sizes[i] }; }),
        in_reply_to: /^in-reply-to:/im.test(headers),
        references: /^references:/im.test(headers),
      };
      if (names.length >= expectedAttachments) return found;
    }
    if (outOfTime(input)) break;
  }
  return found;
}
