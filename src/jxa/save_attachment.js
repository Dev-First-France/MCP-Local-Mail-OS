// Enregistre une pièce jointe à l'emplacement exact décidé (et déjà validé) côté Node.
function main(input, Mail) {
  const mb = boxOf(Mail, input.account, input.mailbox);
  const msg = getMessage(mb, input.id);
  const names = orNull(function () { return msg.mailAttachments.name(); }) || [];
  let index = -1;
  if (typeof input.attachment_index === 'number') {
    // Désignation par position : utilisée pour le transfert, où deux pièces peuvent porter le même nom.
    if (input.attachment_index >= 0 && input.attachment_index < names.length) index = input.attachment_index;
  } else {
    index = names.indexOf(input.attachment_name);
    if (index === -1) {
      const key = looseKey(input.attachment_name);
      const close = [];
      names.forEach(function (n, i) { if (looseKey(n) === key) close.push(i); });
      if (close.length === 1) index = close[0];
    }
  }
  if (index === -1) {
    fail('ATTACHMENT_NOT_FOUND', 'Pièce jointe « ' + (input.attachment_name || input.attachment_index) + ' » introuvable dans le message ' + input.id + '.', {
      existing_attachments: names,
    });
  }
  const att = msg.mailAttachments[index];
  Mail.save(att, { in: Path(input.dest_path) });
  return {
    name: names[index],
    declared_size: orNull(function () { return att.fileSize(); }),
    same_name_count: names.filter(function (n) { return n === names[index]; }).length,
  };
}
