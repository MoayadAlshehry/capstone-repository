/** A failed service read is not evidence that the user's authority was revoked. */
export function deniedRead(status: number): boolean {
  return status === 401 || status === 403 || status === 404;
}
