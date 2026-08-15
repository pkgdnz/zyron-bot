export function serializeMessage(message) {
    return Buffer.from(
        JSON.stringify(message, (key, value) => {
            if (value instanceof Uint8Array) {
                return {
                    __bytes: Buffer.from(value).toString('base64')
                };
            }

            return value;
        })
    );
}

export function deserializeMessage(raw) {
    return JSON.parse(raw.toString(), (key, value) => {
        if (
            value &&
            typeof value === 'object' &&
            typeof value.__bytes === 'string'
        ) {
            return new Uint8Array(
                Buffer.from(value.__bytes, 'base64')
            );
        }

        return value;
    });
}