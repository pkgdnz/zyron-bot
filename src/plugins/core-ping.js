const run = async ({ jid, sock }) => {
    await sock.message.send(jid, 'pong!');
};

const plugin = {
    run,
    name: 'ping',
    command: ['ping'],
    ownerOnly: false,
    description: 'Check bot response and latency.',
    category: ['core']
};

export default plugin;
