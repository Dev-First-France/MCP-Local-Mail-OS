import { config } from './config.js';
import { ErrorCode, MailMcpError } from './errors.js';
import { runJxa } from './osascript.js';

const loose = (s) => String(s).normalize('NFC').trim().toLowerCase();

export async function allAccounts() {
  return (await runJxa('list_accounts')).accounts;
}

export async function enabledAccounts() {
  return (await allAccounts()).filter((a) => a.enabled);
}

export function findAccount(accounts, wanted) {
  const key = loose(wanted);
  return (
    accounts.find((a) => a.name === wanted) ||
    accounts.find((a) => loose(a.name) === key) ||
    accounts.find((a) => a.email_addresses.some((e) => loose(e) === key)) ||
    null
  );
}

// Compte d'écriture par défaut ; à défaut, l'unique compte activé.
export function defaultAccountOf(accounts) {
  const enabled = accounts.filter((a) => a.enabled);
  const hit = findAccount(enabled, config.defaultAccount);
  if (hit) return hit.name;
  return enabled.length === 1 ? enabled[0].name : null;
}

export async function requireDefaultAccount() {
  const accounts = await allAccounts();
  const name = defaultAccountOf(accounts);
  if (name === null) {
    throw new MailMcpError(
      ErrorCode.INVALID_ARGUMENT,
      `Précisez "from_account" : le compte par défaut « ${config.defaultAccount} » n'existe pas ou est désactivé.`,
      { enabled_accounts: accounts.filter((a) => a.enabled).map((a) => a.name) },
    );
  }
  return name;
}
