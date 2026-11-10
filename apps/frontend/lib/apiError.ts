/**
 * Turn whatever the API client threw into a message a person can read.
 *
 * `assertOk` throws the raw JSON body, and the backend answers in several shapes:
 *   {detail: "..."}  {error: "..."}  {error: {message: "..."}}  {message: "..."}  {field: ["..."]}
 * Callers used to read `err.message` only, so most real reasons ("PIN already in use", "Invalid
 * role", "phone already exists") were swallowed and replaced by a generic "Failed to ...".
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    const e = err as any;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.detail === 'string' && e.detail) return e.detail;
    if (typeof e.error === 'string' && e.error) return e.error;
    if (typeof e.error?.message === 'string') return e.error.message;
    // DRF field errors: {phone: ["already exists"], ...}
    for (const value of Object.values(e)) {
        if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    }
    return fallback;
}
