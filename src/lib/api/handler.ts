import { NextRequest, NextResponse } from 'next/server';

type RequestJsonBody = Awaited<ReturnType<NextRequest['json']>>;

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number = 400,
        readonly code = 'bad_request',
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

export type ApiRouteContext = {
    readonly requestId: string;
    readonly routeName: string;
    readonly startedAt: number;
    elapsedMs: () => number;
    json: (body: unknown, init?: ResponseInit) => NextResponse;
    error: (message: string, status?: number) => NextResponse;
    readJson: <T = RequestJsonBody>(request: NextRequest) => Promise<T>;
};

type ApiErrorHandler = (error: unknown, context: ApiRouteContext) => Response | Promise<Response>;

type ApiRouteOptions = {
    name: string;
    onError?: ApiErrorHandler;
};

type StaticRouteContext = { params: Promise<Record<never, never>> };

type ApiRouteHandler<TParams extends StaticRouteContext> = (
    request: NextRequest,
    context: ApiRouteContext,
    routeContext: TParams,
) => Response | Promise<Response>;

function createRequestId(request: NextRequest): string {
    const supplied = request.headers.get('x-request-id')?.trim();
    if (supplied && /^[a-zA-Z0-9_-]{8,128}$/.test(supplied)) {
        return supplied;
    }
    return crypto.randomUUID();
}

function applyResponseMetadata(response: Response, context: ApiRouteContext): Response {
    response.headers.set('X-Request-Id', context.requestId);
    response.headers.set('Server-Timing', `total;dur=${context.elapsedMs()}`);
    return response;
}

export function getApiErrorMessage(error: unknown, fallback = 'Internal server error'): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export function getApiErrorStatus(error: unknown, fallback = 500): number {
    if (error instanceof ApiError) return error.status;

    const code = getApiErrorCode(error);
    if (code === 'unauthenticated') return 401;
    if (code === 'forbidden') return 403;
    return fallback;
}

export function getApiErrorCode(error: unknown): string {
    if (error instanceof ApiError) return error.code;

    const message = getApiErrorMessage(error, '');
    if (message === 'Missing Authorization bearer token') return 'unauthenticated';
    if (message.startsWith('Forbidden')) return 'forbidden';
    return 'internal_error';
}

/**
 * Wraps a Route Handler with stable response metadata and centralized logging.
 * Existing routes can keep their current response body and status policy through
 * the optional onError callback while progressively adopting shared parsing.
 */
export function withApi<TParams extends StaticRouteContext = StaticRouteContext>(options: ApiRouteOptions, handler: ApiRouteHandler<TParams>) {
    return async function apiRouteHandler(request: NextRequest, routeContext: TParams): Promise<Response> {
        const startedAt = Date.now();
        const requestId = createRequestId(request);
        const context: ApiRouteContext = {
            requestId,
            routeName: options.name,
            startedAt,
            elapsedMs: () => Date.now() - startedAt,
            json: (body, init) => NextResponse.json(body, init),
            error: (message, status = 400) => NextResponse.json(
                { error: status >= 500 ? 'Lỗi hệ thống. Vui lòng thử lại sau.' : message },
                { status },
            ),
            readJson: async <T>(sourceRequest: NextRequest) => {
                try {
                    return await sourceRequest.json() as T;
                } catch {
                    throw new ApiError('Invalid JSON request body', 400, 'invalid_json');
                }
            },
        };

        try {
            return applyResponseMetadata(await handler(request, context, routeContext), context);
        } catch (error: unknown) {
            const message = getApiErrorMessage(error);
            const response = options.onError
                ? await options.onError(error, context)
                : context.error(message, getApiErrorStatus(error));
            console.error(`${options.name} API error`, {
                requestId,
                durationMs: context.elapsedMs(),
                status: response.status,
                code: getApiErrorCode(error),
                error: message,
            });
            return applyResponseMetadata(response, context);
        }
    };
}
