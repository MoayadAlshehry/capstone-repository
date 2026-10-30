/** Compose the closed-task return from the server-validated personal parent. */
export function reviewHistoryReturn(locale: 'en' | 'ar', parent: string) {
  const query = new URLSearchParams(parent.split('?')[1]);
  query.set('tab', 'history');
  return '/' + locale + '/reviewer?' + query;
}
