/** Fired when the signed-in user's rights may have changed on the server; <SessionSync/> re-fetches them. */
export const PERMISSIONS_STALE_EVENT = 'mediflow:permissions-stale';

/**
 * Bumped whenever the session is replaced on purpose (an outlet switch). A `/auth/me` that was
 * already in flight when that happened describes the OLD outlet; <SessionSync/> compares the
 * value it saw before asking with the one after and drops the stale answer instead of letting it
 * overwrite the new outlet in the stored user.
 */
let sessionEpoch = 0;
export const getSessionEpoch = () => sessionEpoch;
export const bumpSessionEpoch = () => { sessionEpoch += 1; };
