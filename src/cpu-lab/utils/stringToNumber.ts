export function getNumber(value: string): number {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
        throw new Error(`Invalid numeric value: "${value}"`);
    }
    return parsed;
}
