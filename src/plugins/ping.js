const run = async ctx => {
   const { jid, sock } = ctx;
   const start = Date.now();

   const result = await sock.message.send(jid, 'pong!');
};

const plugin = {
   run,
   name: 'ping',
   command: ['ping'],
   description: 'Respons dengan pengecekan latensi.',
   category: ['core']
};

export default plugin;
