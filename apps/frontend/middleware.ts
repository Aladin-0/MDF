import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/setup', '/sw.js', '/manifest.webmanifest', '/manifest.json']

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Allow static PWA files
    if (pathname === '/sw.js' || pathname === '/manifest.json' || pathname === '/manifest.webmanifest' || pathname.startsWith('/icon-') || pathname === '/favicon.ico') {
        return NextResponse.next();
    }

    // Check auth from cookie (set by Django JWT when backend is real)
    const token = request.cookies.get('access_token')?.value

    const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))

    const mockAuthCookie = request.cookies.get('mediflow_mock_auth')?.value

    const isAuthenticated = !!token || !!mockAuthCookie

    if (!isAuthenticated && !isPublicPath) {
        // Redirect to login, preserve intended destination
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
    }

    if (isAuthenticated && pathname === '/login') {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: [
        '/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|manifest.json|icon-).*)',
    ],
}
