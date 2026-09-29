// Lecture complète d'un message. Ne modifie pas l'état lu/non-lu.
function recipients(list) {
  const addresses = orNull(function () { return list.address(); }) || [];
  const names = orNull(function () { return list.name(); }) || [];
  return addresses.map(function (address, i) {
    return { name: names[i] || null, address: address };
  });
}

function main(input, Mail) {
  const mb = boxOf(Mail, input.account, input.mailbox);
  const msg = getMessage(mb, input.id);

  const body = orNull(function () { return msg.content(); }) || '';
  const att = msg.mailAttachments;
  const names = orNull(function () { return att.name(); }) || [];
  const sizes = orNull(function () { return att.fileSize(); }) || [];
  const mimes = orNull(function () { return att.mimeType(); }) || [];
  const downloaded = orNull(function () { return att.downloaded(); }) || [];

  return {
    id: input.id,
    account: mb.account.name,
    mailbox: mb.path,
    mailbox_role: roleOf(Mail, mb.account, mb.path),
    message_id: orNull(function () { return msg.messageId(); }),
    subject: orNull(function () { return msg.subject(); }) || '',
    sender: orNull(function () { return msg.sender(); }) || '',
    reply_to: orNull(function () { return msg.replyTo(); }),
    to: recipients(msg.toRecipients),
    cc: recipients(msg.ccRecipients),
    bcc: recipients(msg.bccRecipients),
    date_sent: iso(orNull(function () { return msg.dateSent(); })),
    date_received: iso(orNull(function () { return msg.dateReceived(); })),
    read: msg.readStatus(),
    flagged: msg.flaggedStatus(),
    headers_raw: orNull(function () { return msg.allHeaders(); }) || '',
    body: body.length > input.body_max ? body.slice(0, input.body_max) : body,
    body_length: body.length,
    body_truncated: body.length > input.body_max,
    attachments: names.map(function (name, i) {
      return {
        name: name,
        size: sizes[i] === undefined ? null : sizes[i],
        mime_type: mimes[i] === undefined ? null : mimes[i],
        downloaded: downloaded[i] === undefined ? null : downloaded[i],
      };
    }),
  };
}
