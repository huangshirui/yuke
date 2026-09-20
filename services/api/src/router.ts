export type RouteContext = {
  request: Request
}

export async function router(context: RouteContext): Promise<Response> {
  const url = new URL(context.request.url)

  if (url.pathname === '/health') {
    return Response.json({
      status: 'ok',
      service: 'yuke-api'
    })
  }

  return Response.json({ error: 'Not Found' }, { status: 404 })
}
