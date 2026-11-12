import type { Metadata } from 'next'
import LoginForm from './LoginForm'
import { Pill } from 'lucide-react'
import { Suspense } from 'react'

export const metadata: Metadata = {
    title: 'Login — MediFlow',
    description: 'Sign in to your MediFlow pharmacy dashboard',
}

export default function LoginPage() {
    return (
        <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4 py-6 overflow-x-hidden">
            <div className="max-w-md w-full">
                <div className="flex flex-col items-center mb-6">
                    <Pill className="h-10 w-10 text-primary mb-2" />
                    <h1 className="text-3xl font-bold text-slate-900">MediFlow</h1>
                    <p className="text-sm text-muted-foreground mt-1 text-center">Modern pharmacy management for India</p>
                </div>
                <Suspense fallback={<div className="text-center p-4">Loading...</div>}>
                    <LoginForm />
                </Suspense>
                <p className="text-xs text-muted-foreground text-center mt-6">
                    Having trouble? Contact support
                </p>
            </div>
        </div>
    )
}
