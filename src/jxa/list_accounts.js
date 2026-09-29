// Comptes de Mail, avec pour chaque compte activé le chemin de ses boîtes spéciales.
function main(input, Mail) {
  const refs = Mail.accounts();
  return {
    accounts: refs.map(function (ref) {
      const enabled = ref.enabled();
      const out = {
        name: ref.name(),
        type: String(ref.accountType()),
        enabled: enabled,
        full_name: orNull(function () { return ref.fullName(); }),
        email_addresses: orNull(function () { return ref.emailAddresses(); }) || [],
      };
      if (enabled) {
        out.mailbox_count = orNull(function () { return ref.mailboxes.length; });
        out.special_mailboxes = specialOf(Mail, { id: ref.id() });
      }
      return out;
    }),
  };
}
