// Modifie le drapeau et/ou l'état lu d'un message, puis relit les valeurs.
function main(input, Mail) {
  const mb = boxOf(Mail, input.account, input.mailbox);
  const msg = getMessage(mb, input.id);
  if (typeof input.flagged === 'boolean') msg.flaggedStatus = input.flagged;
  if (typeof input.read === 'boolean') msg.readStatus = input.read;
  return {
    id: input.id,
    account: mb.account.name,
    mailbox: mb.path,
    subject: orNull(function () { return msg.subject(); }) || '',
    flagged: msg.flaggedStatus(),
    read: msg.readStatus(),
  };
}
