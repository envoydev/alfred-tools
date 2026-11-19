// Comparing two version strings: catalog's age gate, fix's documented versions and update's plugin offers read it.

// '0.0.83' vs '0.0.9': numeric, part by part. Anything that is not dotted numbers (a dist-tag) compares as unknown (null).
export function compareVersions(left: string, right: string): number | null
{
    const parts = (version: string) => (/^\d+(\.\d+)*$/.test(version) ? version.split('.').map(Number) : null);
    const [leftParts, rightParts] = [parts(left), parts(right)];
    if (!leftParts || !rightParts) return null;
    for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++)
    {
        const difference = (leftParts[i] || 0) - (rightParts[i] || 0);
        if (difference) return difference < 0 ? -1 : 1;
    }
    return 0;
}
