const formatMB = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const run = async ({ m }) => {
    const {
        rss,
        heapTotal,
        heapUsed,
        external,
        arrayBuffers
    } = process.memoryUsage();

    const text = [
        `RSS         : ${formatMB(rss)}`,
        `Heap Total  : ${formatMB(heapTotal)}`,
        `Heap Used   : ${formatMB(heapUsed)}`,
        `External    : ${formatMB(external)}`,
        `Array Buffers: ${formatMB(arrayBuffers)}`
    ].join('\n');

    await m.reply(text);
};

const plugin = {
    run,
    name: 'mem',
    command: ['mem'],
    description: 'Menampilkan penggunaan memori bot.',
    category: ['core']
};

export default plugin;
