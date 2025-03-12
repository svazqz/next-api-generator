import { NextResponse } from 'next/server';
import { ZodType } from 'zod';
import { HandlerFn, NextBaseRequest, ServerFnDefinition } from './types';
import { validateQueryParams, validatePayload, DTO } from './utils';

export const apiWrapper = <
  URLParams extends ZodType,
  QueryParams extends ZodType,
  Body extends ZodType,
  Response extends ZodType,
>(
  def: ServerFnDefinition<URLParams, QueryParams, Body, Response>,
  apiHandler: HandlerFn<URLParams, QueryParams, Body, Response>,
) => {
  const requestHandler = async (
    request: NextBaseRequest<DTO<URLParams>, DTO<QueryParams>>,
    { params }: { params: DTO<URLParams> },
  ): Promise<NextResponse<DTO<Response>>> => {
    let queryParams: QueryParams | undefined = undefined;
    const urlParams: URLParams | undefined = params;
    let parsedPayload: Body | undefined = undefined;

    if (def.auth && (typeof def.auth) === 'function') {
      const isAuthenticated = await def.auth();
      if (!isAuthenticated) {
        return new NextResponse(
          JSON.stringify({
            error: 'Access denied',
          }),
          {
            status: 403,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
    }

    try {
      if (def.schemas?.queryParams) {
        queryParams = validateQueryParams(request, def) as QueryParams;
      }
    } catch (e) {
      return new NextResponse(
        JSON.stringify({
          error: (e as Error).message,
          at: 'query_validation',
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    try {
      if (def.schemas?.payload) {
        parsedPayload = (await validatePayload(
          request,
          def,
          undefined,
        )) as Body;
      }
    } catch (e) {
      return new NextResponse(
        JSON.stringify({
          error: (e as Error).message,
          at: 'payload_validation',
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    let responseHandler = undefined;
    try {
      responseHandler = await apiHandler(
        request,
        queryParams,
        urlParams,
        parsedPayload,
      );
    } catch (e) {
      return new NextResponse(
        JSON.stringify({
          error: (e as Error).message,
          at: 'response_handler',
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      );
    }

    if (def.schemas?.response && !def.skipOutputValidation) {
      try {
        def.schemas?.response?.parse(responseHandler);
      } catch (e) {
        return new NextResponse(
          JSON.stringify({
            error: (e as Error).message,
            at: 'response_validation',
          }),
          {
            status: 500,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
    }

    const responseObject =
      typeof responseHandler === 'object'
        ? responseHandler
        : { data: responseHandler };

    return new NextResponse(JSON.stringify(responseObject), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return requestHandler;
};
