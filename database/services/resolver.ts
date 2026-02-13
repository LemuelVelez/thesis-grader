import { createPgDatabaseServices } from './PgDatabaseServices';
import type { DatabaseServices } from './Services';

declare global {
    // eslint-disable-next-line no-var
    var __thesisGraderConcreteDbServices: DatabaseServices | undefined;
    // eslint-disable-next-line no-var
    var __thesisGraderDbServices: DatabaseServices | undefined;
    // eslint-disable-next-line no-var
    var __thesisGraderDbServicesResolver:
        | (() => DatabaseServices | Promise<DatabaseServices>)
        | undefined;
}

function getOrCreateServices(): DatabaseServices {
    if (!globalThis.__thesisGraderConcreteDbServices) {
        const services = createPgDatabaseServices();
        globalThis.__thesisGraderConcreteDbServices = services;
        globalThis.__thesisGraderDbServices = services;
    }

    return globalThis.__thesisGraderConcreteDbServices;
}

export async function resolveDatabaseServices(): Promise<DatabaseServices> {
    return getOrCreateServices();
}

export function getDatabaseServices(): DatabaseServices {
    return getOrCreateServices();
}

// Wire global resolver hooks expected by database/routes/Route.ts
if (!globalThis.__thesisGraderDbServicesResolver) {
    globalThis.__thesisGraderDbServicesResolver = resolveDatabaseServices;
}
