import util from 'node:util';
import { isOwner } from '../owner.js';

const run = async ({ m, q, text, sock, jid }) => {
   if (!isOwner(m)) return;

   const target = q || m;

   try {
      let result = await eval("(async () => { " + text + " })()");

      if (typeof result !== 'string') {
         result = util.inspect(result);
      }

      return await sock.message.send(
         jid,
         result,
         { quote: target }
      );
   } catch (err) {
      console.error(err);
      return await sock.message.send(
         jid,
         err.stack || err.message,
         { quote: target }
      );
   }
};

const plugin = {
   run,
   name: 'eval async',
   command: ['!!'],
   description: 'Eksekusi kode JavaScript async.',
   ownerOnly: true,
   category: ['core']
};

export default plugin;
