/** Transient token for the opt-in, isolated local INSPECT demo. Never persist it. */
let token: string | null = null;

export function setInspectDemoToken(value: string | null) { token = value; }
export function getInspectDemoToken() { return token; }
