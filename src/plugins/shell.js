import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { isOwner } from '../owner.js';

const sh = promisify(exec);

const run = async ({ m, text, sock, jid }) => {
   if (!isOwner(m)) return;

   if (!text) {
      return m.reply('Masukkan perintah shell.');
   }

   try {
      const { stdout, stderr } = await sh(text, {
         windowsHide: true,
         timeout: 30000
      });

      const output = (stdout || stderr || 'Done.').trim();

      return m.reply(output);
   } catch (err) {
      const output =
         `${err.stdout || ''}${err.stderr || err.message}`.trim();

      return m.reply(output);
   }
};

const plugin = {
   run,
   name: 'shell',
   command: ['$'],
   description: 'Menjalankan perintah shell.',
   ownerOnly: true,
   category: ['core']
};

export default plugin;
