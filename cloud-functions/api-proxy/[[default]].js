const ALLOWED_PATHS = new Set([
  'responses',
  'images/generations',
  'images/edits',
])

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

function getEnv(context, name) {
  return context?.env?.[name] || process?.env?.[name] || ''
}

function buildUpstreamUrl(request, targetBase) {
  const url = new URL(request.url)
  const rawPath = url.pathname.replace(/^\/api-proxy\/?/, '').replace(/^\/+/, '')
  const upstreamPath = rawPath.replace(/^v1\//, '')

  if (!ALLOWED_PATHS.has(upstreamPath)) {
    return null
  }

  return `${targetBase.replace(/\/+$/, '')}/${upstreamPath}${url.search}`
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  })
}

export async function onRequestPost(context) {
  const targetBase = getEnv(context, 'API_PROXY_URL')

  if (!targetBase) {
    return new Response('Missing API_PROXY_URL', {
      status: 500,
      headers: corsHeaders(),
    })
  }

  const upstreamUrl = buildUpstreamUrl(context.request, targetBase)
  if (!upstreamUrl) {
    return new Response('Forbidden: API Proxy path restricted', {
      status: 403,
      headers: corsHeaders(),
    })
  }

  const headers = new Headers(context.request.headers)
  headers.delete('host')
  headers.delete('content-length')

  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers,
    body: context.request.body,
  })

  const responseHeaders = new Headers(upstream.headers)
  for (const [key, value] of Object.entries(corsHeaders())) {
    responseHeaders.set(key, value)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  })
}

export async function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: corsHeaders(),
  })
}
