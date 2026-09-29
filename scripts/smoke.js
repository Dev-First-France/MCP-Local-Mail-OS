// Test de fumée en LECTURE SEULE : lance le serveur, liste les tools,
// puis appelle list_mailboxes et list_messages sur INBOX.
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
const client = new Client({ name: 'mail-mcp-smoke', version: '0.1.0' });

let failures = 0;

async function call(name, args) {
  const started = Date.now();
  const res = await client.callTool({ name, arguments: args });
  const ms = Date.now() - started;
  const data = JSON.parse(res.content[0].text);
  if (res.isError) {
    failures++;
    console.log(`✗ ${name} (${ms} ms) → ${data.error.code} : ${data.error.message}`);
    return null;
  }
  console.log(`✓ ${name} (${ms} ms)`);
  return data;
}

function countBoxes(nodes) {
  return nodes.reduce((n, b) => n + 1 + countBoxes(b.children), 0);
}

try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  console.log(`✓ ${tools.length} tools exposés : ${tools.map((t) => t.name).join(', ')}`);

  const boxes = await call('list_mailboxes', {});
  if (boxes) {
    const inbox = boxes.mailboxes.find((b) => b.path === 'INBOX');
    console.log(`  compte ${boxes.account} : ${countBoxes(boxes.mailboxes)} boîtes` +
      (inbox ? `, INBOX = ${inbox.message_count} messages dont ${inbox.unread_count} non lus` : ''));
  }

  const list = await call('list_messages', { mailbox: 'INBOX', limit: 5 });
  if (list) {
    for (const m of list.messages) {
      const flags = `${m.read ? ' ' : '●'}${m.flagged ? '⚑' : ' '}${m.has_attachments ? '📎' : ' '}`;
      console.log(`  ${flags} [${m.id}] ${m.date}  ${m.sender.slice(0, 30).padEnd(30)}  ${m.subject.slice(0, 50)}`);
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
