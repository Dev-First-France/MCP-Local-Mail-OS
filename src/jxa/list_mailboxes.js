// Liste à plat des boîtes d'un compte ; l'arbre est reconstruit côté Node.
function main(input, Mail) {
  const account = getAccount(Mail, input.account);
  const specs = account.ref.mailboxes();
  const names = account.ref.mailboxes.name();
  const unread = account.ref.mailboxes.unreadCount();
  return {
    account: account.name,
    special_mailboxes: specialOf(Mail, account),
    mailboxes: specs.map(function (spec, i) {
      const path = pathOfMailbox(spec);
      return {
        name: names[i],
        path: path,
        role: roleOf(Mail, account, path),
        message_count: input.with_counts === false ? null : orNull(function () { return spec.messages.length; }),
        unread_count: unread[i],
      };
    }),
  };
}
