import type { DatabaseServices } from '../services/Services';

import type { DatabaseServicesResolver } from './Route.types';

declare global {
    // eslint-disable-next-line no-var
    var __thesisGraderDbServices: DatabaseServices | undefined;
    // eslint-disable-next-line no-var
    var __thesisGraderDbServicesResolver:
        | (() => DatabaseServices | Promise<DatabaseServices>)
        | undefined;
}

let moduleResolver: DatabaseServicesResolver = null;

/**
 * Set a process-wide resolver for DatabaseServices.
 * Useful in server bootstrap or tests.
 */
export function setDatabaseServicesResolver(
    resolver: () => DatabaseServices | Promise<DatabaseServices>,
): void {
    moduleResolver = resolver;
}

/**
 * Clear process-wide resolver (mainly for tests).
 */
export function clearDatabaseServicesResolver(): void {
    moduleResolver = null;
}

export async function defaultResolveDatabaseServices(): Promise<DatabaseServices> {
    if (moduleResolver) {
        return await moduleResolver();
    }

    if (globalThis.__thesisGraderDbServicesResolver) {
        return await globalThis.__thesisGraderDbServicesResolver();
    }

    if (globalThis.__thesisGraderDbServices) {
        return globalThis.__thesisGraderDbServices;
    }

    throw new Error(
        'DatabaseServices resolver is not configured. ' +
        'Call setDatabaseServicesResolver(...) or set globalThis.__thesisGraderDbServices.',
    );
}
