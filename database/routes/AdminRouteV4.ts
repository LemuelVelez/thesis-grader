import { NextRequest } from 'next/server';

import type { DatabaseServices } from '../services/Services';
import {
    dispatchAuditLogsRequest as dispatchAuditLogsRequestV2,
    dispatchRubricTemplatesRequest as dispatchRubricTemplatesRequestV2,
    dispatchThesisGroupsRequest as dispatchThesisGroupsRequestV2,
} from './AdminRouteV2';

export interface DispatchThesisGroupsOptions {
    autoCreateMissingStudentProfile?: boolean;
}

/**
 * Admin routes v4
 * - Thesis groups
 * - Rubric templates
 * - Audit logs
 *
 * This file is introduced to split admin routing responsibilities
 * without changing existing behavior in V2.
 */

export async function dispatchThesisGroupsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
    options: DispatchThesisGroupsOptions = {},
): Promise<Response> {
    return dispatchThesisGroupsRequestV2(req, tail, services, options);
}

export async function dispatchRubricTemplatesRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    return dispatchRubricTemplatesRequestV2(req, tail, services);
}

export async function dispatchAuditLogsRequest(
    req: NextRequest,
    tail: string[],
    services: DatabaseServices,
): Promise<Response> {
    return dispatchAuditLogsRequestV2(req, tail, services);
}
