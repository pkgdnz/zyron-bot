export function toTimestamp(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value.toNumber === 'function') return value.toNumber();
    return Number(value);
}