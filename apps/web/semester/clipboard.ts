/** Clipboard permission, unavailable APIs and transport failures share one recovery path. */
export async function copyOriginalText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
