import { z } from 'zod';
import { config } from '../config.js';
import { matchContacts } from '../contacts.js';
import { runJxa } from '../osascript.js';
import { handler } from '../result.js';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

async function searchContacts({ query, limit }) {
  const { contacts } = await runJxa('list_contacts');
  return matchContacts(contacts, query, limit);
}

export function registerContactTools(server) {
  server.registerTool(
    'search_contacts',
    {
      title: 'Rechercher dans les contacts',
      description:
        "Cherche dans l'application Contacts du Mac les fiches dont le nom, le surnom, l'organisation ou une adresse contient tous les mots " +
        'de la recherche (insensible à la casse et aux accents), et renvoie leurs adresses électroniques avec leur libellé (home, work…). ' +
        "À utiliser quand l'utilisateur désigne un destinataire par son nom : s'il y a plusieurs fiches ou plusieurs adresses possibles, " +
        'les lui présenter et le laisser choisir ; ne jamais deviner une adresse. ' +
        'Les fiches sans adresse ne sont pas renvoyées, seulement comptées dans "without_email". Lecture seule ; si Contacts est fermé, il est lancé en arrière-plan puis refermé.',
      inputSchema: {
        query: z.string().trim().min(2).max(200).describe('Nom, prénom, organisation ou fragment d\'adresse (2 caractères au minimum).'),
        limit: z.number().int().min(1).max(config.listLimitMax).default(20).describe('Nombre maximal de fiches (1 à 100).'),
      },
      annotations: READ_ONLY,
    },
    handler(searchContacts),
  );
}
