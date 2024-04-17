function unionOfSets<T>(set: Set<T>, other: Set<T>): Set<T> {
    const newSet = new Set<T>(set);

    for (const v of Array.from(other.values())) {
        newSet.add(v);
    }

    return newSet;
}

function differenceOfSets<T>(set: Set<T>, other: Set<T>): Set<T> {
    return new Set<T>(
        Array.from(set.values())
            .filter(v => !other.has(v))
    );
}

function intersectionOfSets<T>(set: Set<T>, other: Set<T>): Set<T> {
    return new Set<T>(
        Array.from(set.values())
            .filter(v => other.has(v))
    );
}