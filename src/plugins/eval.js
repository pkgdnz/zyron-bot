import util from 'node:util';
import { isOwner } from '../owner.js';

const run = async ({ m, q, text }) => {
   if (!isOwner(m)) return;

   const target = q || m;

   try {
      let result = await eval(text);

      if (typeof result !== 'string') {
         result = util.inspect(result);
      }

      return await target.reply(result);
   } catch (err) {
      console.error(err);

      return await target.reply(err.message);
   }
};

const plugin = {
   run,
   name: 'eval',
   command: ['!'],
   description: 'Eksekusi kode JavaScript.',
   ownerOnly: true,
   category: ['core']
};

export default plugin;
