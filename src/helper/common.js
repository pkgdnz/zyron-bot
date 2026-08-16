export function getFirstStringAndRest(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { firstString: '', restString: '' };

    const index = trimmed.indexOf(' ');
    if (index === -1) {
        return { firstString: trimmed, restString: '' };
    }

    return {
        firstString: trimmed.slice(0, index),
        restString: trimmed.slice(index)
    };
}

export function getOneRandomElemenFrom(array) {
    if (!Array.isArray(array) || array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
}

export async function streamToBuffer(stream) {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}
