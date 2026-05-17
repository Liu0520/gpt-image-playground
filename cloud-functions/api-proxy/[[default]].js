function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

function getEnv(context, name) {
  const nodeEnv = typeof process !== 'undefined' ? process.env?.[name] : ''
  return context?.env?.[name] || nodeEnv || ''
}

function buildUpstreamUrl(request, targetBase) {
  const url = new URL(request.url)
  const rawPath = url.pathname.replace(/^\/api-proxy\/?/, '').replace(/^\/+/, '')
  const upstreamPath = rawPath.replace(/^v1\//, '')

  if (
    upstreamPath !== 'responses' &&
    upstreamPath !== 'images/generations' &&
    upstreamPath !== 'images/edits' &&
    !/^responses\/[A-Za-z0-9_.-]+$/.test(upstreamPath)
  ) return null

  return `${targetBase.replace(/\/+$/, '')}/${upstreamPath}${url.search}`
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(),
  })
}

async function proxyRequest(context, method) {
  try {
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
      method,
      headers,
      body: method === 'GET' ? undefined : await context.request.arrayBuffer(),
    })

    const responseHeaders = new Headers(upstream.headers)
    for (const [key, value] of Object.entries(corsHeaders())) {
      responseHeaders.set(key, value)
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(`Proxy error: ${message}`, {
      status: 502,
      headers: corsHeaders(),
    })
  }
}

export async function onRequestGet(context) {
  return proxyRequest(context, 'GET')
}

export async function onRequestPost(context) {
  return proxyRequest(context, 'POST')
}

export async function onRequest() {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: corsHeaders(),
  })
}
