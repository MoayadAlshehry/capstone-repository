/** A lost reply cannot establish whether the public registration committed. */
export async function submitPartnerRegistration(
  input: unknown,
): Promise<'confirmed' | 'rejected' | 'unconfirmed'> {
  try {
    const response = await fetch('/api/partners/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (response.ok) return 'confirmed';
    return response.status >= 400 && response.status < 500
      ? 'rejected'
      : 'unconfirmed';
  } catch {
    return 'unconfirmed';
  }
}
