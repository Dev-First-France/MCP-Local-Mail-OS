#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerAttachmentTools } from './src/tools/attachments.js';
import { registerComposeTools } from './src/tools/compose.js';
import { registerDeleteTools } from './src/tools/delete.js';
import { registerForwardTools } from './src/tools/forward.js';
import { registerOrganizeTools } from './src/tools/organize.js';
import { registerReadTools } from './src/tools/read.js';

const server = new McpServer(
  { name: 'mail-mcp', version: '0.3.0' },
  {
    instructions:
      'Pilote Apple Mail, tous comptes activés. Un message est identifié par le triplet (account, mailbox, id). ' +
      'Commencer par list_accounts pour connaître les comptes et leurs boîtes spéciales. ' +
      "Aucun envoi ni aucune suppression sans avoir montré l'aperçu à l'utilisateur et obtenu son accord explicite.",
  },
);

registerReadTools(server);
registerOrganizeTools(server);
registerAttachmentTools(server);
registerComposeTools(server);
registerForwardTools(server);
registerDeleteTools(server);

// stdout est réservé au protocole MCP : tout le reste part sur stderr.
await server.connect(new StdioServerTransport());
console.error('[mail-mcp] serveur démarré (stdio)');
