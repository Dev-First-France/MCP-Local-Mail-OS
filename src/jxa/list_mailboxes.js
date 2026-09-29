// Liste à plat des boîtes du compte ; l'arbre est reconstruit côté Node.
function main(input, Mail) {
  const acc = getAccount(Mail, input);
  const specs = acc.mailboxes();
  const names = acc.mailboxes.name();
  const unread = acc.mailboxes.unreadCount();
  return {
    account: acc.name(),
    mailboxes: specs.map(function (spec, i) {
      return {
        name: names[i],
        path: pathOfMailbox(spec),
        message_count: input.with_counts === false ? null : orNull(function () { return spec.messages.length; }),
        unread_count: unread[i],
      };
    }),
  };
}
