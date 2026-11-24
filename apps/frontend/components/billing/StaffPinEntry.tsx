'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Pill, Delete, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { staffApi } from '@/lib/apiClient'
import { useBillingStore } from '@/store/billingStore'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'

const PIN_LENGTH = 4

export function StaffPinEntry() {
    const [pinDigits, setPinDigits] = useState<string[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isShaking, setIsShaking] = useState(false)

    // What has been typed and whether a check is running, readable at once inside a key handler.
    // State only draws the dots: two keys can arrive before React re-renders, and reading state
    // there lost a digit (or sent the PIN twice) for anyone typing fast on a number pad.
    const digitsRef = useRef<string[]>([])
    const busyRef = useRef(false)
    const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    const router = useRouter()

    const user = useAuthStore(state => state.user)
    const selectedOutletId = useSettingsStore(state => state.selectedOutletId)
    const { setActiveStaff } = useBillingStore(useShallow((s) => ({ setActiveStaff: s.setActiveStaff })))

    const showDigits = useCallback((digits: string[]) => {
        digitsRef.current = digits
        setPinDigits(digits)
    }, [])

    const verifyPin = useCallback(async (pin: string) => {
        busyRef.current = true
        setIsLoading(true)
        setError(null)
        try {
            const outletId = selectedOutletId ?? user?.outletId ?? ''
            const staff = await staffApi.lookupByPin(pin, outletId)
            // Straight into billing: the bill screen opening is the confirmation.
            // (A fixed half-second "Verified" pause used to sit here on every single login.)
            setActiveStaff(staff)
        } catch (err: any) {
            setError(err?.error?.message ?? "Invalid PIN. Please try again.")
            showDigits([])   // ready for the next try at once, not after the shake has finished
            setIsShaking(true)
            if (shakeTimer.current) clearTimeout(shakeTimer.current)
            shakeTimer.current = setTimeout(() => setIsShaking(false), 500)
        } finally {
            busyRef.current = false
            setIsLoading(false)
        }
    }, [setActiveStaff, showDigits, user, selectedOutletId])

    const handleInput = useCallback((key: string) => {
        if (busyRef.current) return
        const digits = digitsRef.current

        if (key === 'Backspace') {
            showDigits(digits.slice(0, -1))
            setError(null)
        } else if (key === 'Escape') {
            showDigits([])
            setError(null)
        } else if (/^\d$/.test(key) && digits.length < PIN_LENGTH) {
            const next = [...digits, key]
            showDigits(next)
            setError(null)
            if (next.length === PIN_LENGTH) verifyPin(next.join(''))
        }
    }, [showDigits, verifyPin])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // a held-down key or a shortcut (Ctrl+1 ...) is not a PIN digit
            if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return
            handleInput(e.key)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleInput])

    useEffect(() => () => { if (shakeTimer.current) clearTimeout(shakeTimer.current) }, [])

    return (
        <div data-testid="pin-overlay" className="fixed inset-0 z-50 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center relative overflow-hidden">
                <button 
                    onClick={() => router.push('/dashboard')}
                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                    title="Go back to Dashboard"
                >
                    <X className="w-5 h-5" />
                </button>
                
                <div className="flex flex-col items-center">
                    <div className="bg-primary/10 p-3 rounded-full mb-4">
                        <Pill className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900">Enter Your PIN</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        4-digit staff PIN to start billing session
                    </p>
                </div>

                {/* Hidden focusable input for automated testing — window keydown listener handles actual PIN logic */}
                <input
                    data-testid="pin-input"
                    type="password"
                    className="sr-only"
                    autoFocus
                    readOnly
                    value=""
                    onChange={() => {}}
                    aria-label="PIN input"
                />

                <div className={cn("flex gap-3 justify-center mt-6", isShaking && "animate-shake")}>
                    {Array.from({ length: PIN_LENGTH }, (_, index) => index).map((index) => {
                        const isActive = pinDigits.length === index;
                        const isFilled = pinDigits.length > index;
                        return (
                            <div 
                                key={index} 
                                className={cn(
                                    "w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                                    isFilled ? "border-primary bg-primary" : "border-slate-300 bg-slate-50",
                                    isActive && !isLoading ? "border-primary/60 scale-110 shadow-[0_0_10px_rgba(var(--primary),0.3)] animate-pulse" : ""
                                )}
                            >
                                {isFilled && <div className="w-3 h-3 rounded-full bg-white animate-in zoom-in" />}
                            </div>
                        )
                    })}
                </div>

                <div className="h-6 mt-3">
                    {error && <p data-testid="pin-error" className="text-sm text-red-600 animate-in fade-in">{error}</p>}
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            onClick={() => handleInput(num.toString())}
                            disabled={isLoading}
                            className="w-full h-14 rounded-xl text-xl font-semibold bg-slate-100 hover:bg-slate-200 active:scale-95 transition-transform text-slate-900 flex items-center justify-center select-none"
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={() => handleInput('Escape')}
                        disabled={isLoading}
                        className="w-full h-14 rounded-xl text-xl font-semibold bg-red-50 text-red-600 hover:bg-red-100 active:scale-95 transition-transform flex items-center justify-center select-none"
                    >
                        ×
                    </button>
                    <button
                        onClick={() => handleInput('0')}
                        disabled={isLoading}
                        className="w-full h-14 rounded-xl text-xl font-semibold bg-slate-100 hover:bg-slate-200 active:scale-95 transition-transform text-slate-900 flex items-center justify-center select-none"
                    >
                        0
                    </button>
                    <button
                        onClick={() => handleInput('Backspace')}
                        disabled={isLoading}
                        className="w-full h-14 rounded-xl text-xl font-semibold bg-slate-100 hover:bg-slate-200 active:scale-95 transition-transform text-slate-600 flex items-center justify-center select-none"
                    >
                        <Delete className="w-6 h-6" />
                    </button>
                </div>

                <div className="mt-8 flex items-center justify-between text-sm px-2">
                    <span className="text-slate-400 cursor-not-allowed">Switch Outlet</span>
                    {user && (
                        <div className="flex items-center gap-2 text-slate-500">
                            Logged in as <span className="font-medium text-slate-700">{user.name}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
