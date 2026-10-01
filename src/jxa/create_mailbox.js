// Crée une boîte dans un compte, à la racine ou sous une boîte parente EXISTANTE.
// Mail accepte sans erreur la création d'une boîte qui existe déjà (rien n'est créé) et crée
// implicitement un parent absent : les deux cas sont refusés ici, avant toute écriture.
function main(input, Mail) {
  const account = getAccount(Mail, input.account);
  const name = String(input.name || '');
  if (name === '' || name.indexOf('/') !== -1) {
    fail('INVALID_ARGUMENT', 'Nom de boîte invalide : « ' + name + ' ».');
  }
  const parent = input.parent ? resolveMailboxPath(Mail, account, input.parent) : null;
  const path = parent === null ? name : parent + '/' + name;

  const paths = mailboxPaths(account);
  const key = looseKey(path);
  const existing = paths.filter(function (p) { return p === path || looseKey(p) === key; });
  if (existing.length > 0) {
    fail(
      'MAILBOX_EXISTS',
      'La boîte « ' + existing[0] + ' » existe déjà dans le compte ' + account.name + '.',
      { account: account.name, mailbox: existing[0], role: roleOf(Mail, account, existing[0]) },
    );
  }

  // Un chemin « Parent/Enfant » crée la boîte sous son parent (constaté sur iCloud, Mail 16).
  account.ref.mailboxes.push(Mail.Mailbox({ name: path }));

  // La boîte apparaît en général tout de suite ; on relit la liste sans cache, avec le budget de temps.
  let found = false;
  while (!found) {
    delete MAILBOX_PATHS[account.id];
    found = mailboxPaths(account).indexOf(path) !== -1;
    if (found || outOfTime(input)) break;
    delay(0.5);
  }

  return {
    created: found,
    account: account.name,
    name: name,
    parent: parent,
    path: path,
    message_count: found ? orNull(function () { return account.ref.mailboxes.byName(path).messages.length; }) : null,
  };
}
