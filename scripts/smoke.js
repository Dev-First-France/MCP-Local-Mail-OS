// Test de fumée en LECTURE SEULE : lance le serveur, liste les tools, les comptes et les boîtes,
// puis les derniers messages reçus, tous comptes confondus.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(root, 'index.js')],
  stderr: 'ignore',
});
const client = new Client({ name: 'mail-mcp-smoke', version: '0.3.0' });

let failures = 0;

async function call(name, args) {
  const started = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const ms = Date.now() - started;
  let data;
  try {
    data = JSON.parse(res.content[0].text);
  } catch {
    data = { error: { code: 'REPONSE_ILLISIBLE', message: res.content[0].text.slice(0, 200) } };
  }
  if (res.isError) {
    failures++;
    console.log(`✗ ${name} (${ms} ms) → ${data.error.code} : ${data.error.message}`);
    return null;
  }
  console.log(`✓ ${name} (${ms} ms)`);
  return data;
}

const countBoxes = (nodes) => nodes.reduce((n, b) => n + 1 + countBoxes(b.children), 0);

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`✓ ${tools.length} tools exposés : ${tools.map((t) => t.name).join(', ')}`);

  const accounts = await call('list_accounts', {});
  if (accounts) {
    const enabled = accounts.accounts.filter((a) => a.enabled);
    console.log(`  ${enabled.length} compte(s) activé(s) sur ${accounts.accounts.length}, compte par défaut : ${accounts.default_account}`);
    for (const a of enabled) {
      console.log(`  - ${a.name} (${a.type}) : réception « ${a.special_mailboxes.inbox} », corbeille « ${a.special_mailboxes.trash} »`);
    }
  }

  const boxes = await call('list_mailboxes', {});
  if (boxes) {
    for (const a of boxes.accounts) console.log(`  - ${a.account} : ${countBoxes(a.mailboxes)} boîtes`);
  }

  const list = await call('list_messages', { mailbox: 'INBOX', limit: 5 });
  if (list) {
    for (const m of list.messages) {
      const flags = `${m.read ? ' ' : '●'}${m.flagged ? '⚑' : ' '}${m.has_attachments ? '📎' : ' '}`;
      console.log(`  ${flags} ${m.date}  ${m.account.slice(0, 16).padEnd(16)}  ${m.sender.slice(0, 26).padEnd(26)}  ${m.subject.slice(0, 44)}`);
    }
  }
} catch (error) {
  failures++;
  console.log(`✗ échec du test de fumée : ${error.message}`);
} finally {
  await client.close().catch(() => {});
}

console.log(failures === 0 ? '\nSmoke OK (aucune écriture effectuée).' : `\nSmoke en échec : ${failures} erreur(s).`);
process.exit(failures === 0 ? 0 : 1);
