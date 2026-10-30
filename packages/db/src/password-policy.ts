export const newPasswordPolicy = Object.freeze({ minimum: 15, maximum: 128 });
export function validNewPassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    Array.from(value).length >= newPasswordPolicy.minimum &&
    Array.from(value).length <= newPasswordPolicy.maximum
  );
}
