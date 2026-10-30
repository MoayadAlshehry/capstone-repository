export function reviewReasonValid(value: string) {
  const length = [...value.trim()].length;
  return (
    length >= 3 &&
    length <= 400 &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)
  );
}
