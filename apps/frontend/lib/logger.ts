/**
 * Generic Logger Interface for Billing Module (Phase D2)
 * Designed to provide a stable API that can later be wired to Sentry or Datadog
 * without modifying the billing logic again.
 */

type LogLevel = 'info' | 'warn' | 'error';

interface LogPayload {
    event: string;
    [key: string]: any;
}

class Logger {
    private log(level: LogLevel, payload: LogPayload) {
        // In Phase D2, we just proxy to console.
        // In Phase D3/future, this will dispatch to external telemetry service.
        const message = JSON.stringify({
            timestamp: new Date().toISOString(),
            level,
            ...payload
        });

        if (level === 'error') {
            console.error(message);
        } else if (level === 'warn') {
            console.warn(message);
        } else {
            console.info(message);
        }
    }

    info(event: string, data: Record<string, any> = {}) {
        this.log('info', { event, ...data });
    }

    warn(event: string, data: Record<string, any> = {}) {
        this.log('warn', { event, ...data });
    }

    error(event: string, error: any, data: Record<string, any> = {}) {
        this.log('error', { 
            event, 
            error: error?.message || error?.detail || String(error),
            rawError: error,
            ...data 
        });
    }
}

export const logger = new Logger();
