/** Follow the submitted form's actual field order, regardless of validation order. */
export function firstInvalidEntryField(
  controls: ArrayLike<{ id: string }>,
  errors: Readonly<Record<string, string>>,
) {
  return Array.from(controls).find((control) => Boolean(errors[control.id]))
    ?.id;
}
