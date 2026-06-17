// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — ID Generation Utilities
// ═══════════════════════════════════════════════════════════
//
// Generates ULID-like sortable unique identifiers.
// Format: timestamp (10 chars) + random (16 chars) = 26 chars
// Sortable by creation time, globally unique.

const ENCODING = "0123456789abcdefghjkmnpqrstvwxyz"; // Crockford Base32

/**
 * Generate a ULID-like unique identifier.
 * Time-sortable, 26 characters, Crockford Base32 encoding.
 */
export function generateId(): string {
  const now = Date.now();
  let timeStr = "";

  // Encode timestamp (48-bit, 10 characters)
  let t = now;
  for (let i = 9; i >= 0; i--) {
    timeStr = ENCODING[t & 0x1f] + timeStr;
    t = Math.floor(t / 32);
  }

  // Generate random part (80-bit, 16 characters)
  let randomStr = "";
  for (let i = 0; i < 16; i++) {
    randomStr += ENCODING[Math.floor(Math.random() * 32)];
  }

  return timeStr + randomStr;
}

/**
 * Generate a prefixed ID for specific entity types.
 * E.g., "ses_01j5k..." for sessions, "msg_01j5k..." for messages
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${generateId()}`;
}

/**
 * Generate a session ID.
 */
export function generateSessionId(): string {
  return generatePrefixedId("ses");
}

/**
 * Generate a message ID.
 */
export function generateMessageId(): string {
  return generatePrefixedId("msg");
}

/**
 * Generate a snapshot ID.
 */
export function generateSnapshotId(): string {
  return generatePrefixedId("snap");
}
