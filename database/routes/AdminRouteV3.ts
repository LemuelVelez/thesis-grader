import { NextRequest } from 'next/server';

import type { UUID } from '../models/Model';
import type { DatabaseServices } from '../services/Services';
import {
    dispatchDefenseSchedulesRequest as dispatchDefenseSchedulesRequestV2,
    dispatchSchedulePanelistsRequest as dispatchSchedulePanelistsRequestV2,
} from './AdminRouteV2';

export interface DispatchSchedulePanelistsOptions {
    forcedScheduleId?: UUID;
}

/**
 * Admin routes v3
 * - Defense schedules
 * - Schedule panelists
 *
 * This file is introduced to split admin routing responsibilities
 * without changing existing behavior in V2.
 */

export async function dispatchSchedulePanelistsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
    options: DispatchSchedulePanelistsOptions = {},
): Promise<Response> {
    return dispatchSchedulePanelistsRequestV2(req, tail, services, options);
}

export async function dispatchDefenseSchedulesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    return dispatchDefenseSchedulesRequestV2(req, tail, services);
}
