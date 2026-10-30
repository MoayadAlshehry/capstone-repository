export const escapeMail = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
/** One Gmail-compatible, text-first identity for every existing transactional purpose. */
export function brandedMail(input: {
  locale: 'en' | 'ar';
  origin: string;
  subject: string;
  title: string;
  body: string;
  label: string;
  expiry: string;
  action?: string;
  link?: string;
  code?: string;
  name?: string;
  secondary?: string;
}) {
  const {
      locale,
      origin,
      subject,
      title,
      body,
      label,
      expiry,
      action,
      link,
      code,
      name,
      secondary,
    } = input,
    ar = locale === 'ar',
    e = escapeMail;
  const ignore = ar
    ? 'إذا لم تكن تتوقع هذه الرسالة، يمكنك تجاهلها. لا تشارك رابطك أو رمزك مع أحد.'
    : 'If you weren’t expecting this email, you can ignore it. Keep your link or code private.';
  const fallback = ar
    ? 'إذا لم يعمل الزر، انسخ هذا الرابط إلى متصفحك:'
    : 'If the button does not work, copy this link into your browser:';
  const main = link
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0"><tr><td class="button-cell" align="center" bgcolor="#145e56" style="background:#145e56;border-radius:10px"><a class="button-link" href="${e(link)}" rel="noreferrer" style="display:block;padding:16px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:bold;line-height:24px">${e(action ?? title)}</a></td></tr></table>`
    : code
      ? `<p class="code-panel" dir="ltr" style="padding:24px 12px;background:#eef4ef;border-radius:12px;text-align:center;font-family:Consolas,monospace;font-size:36px;line-height:48px;letter-spacing:7px;font-weight:bold;color:#145e56">${e(code)}</p>`
      : '';
  return {
    subject,
    textbody: [
      ar ? 'مستودع مشاريع التخرج' : 'Capstone Repository',
      title,
      ...(name ? [name] : []),
      body,
      ...(link ? [(action ?? title) + ': ' + link] : code ? [code] : []),
      expiry,
      ...(secondary ? [secondary] : []),
      ignore,
    ]
      .filter(Boolean)
      .join('\n\n'),
    htmlbody: `<!doctype html><html lang="${locale}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${e(subject)}</title><style>body{margin:0;padding:0}a:focus-visible{outline:3px solid #c7a46a;outline-offset:4px}@media(max-width:620px){.outer{padding:24px 16px!important}.content{padding:28px 22px!important}.heading{font-size:28px!important;line-height:36px!important}}@media(prefers-color-scheme:dark){.email-background{background:#161d23!important}.email-card{background:#202c35!important;border-color:#47616c!important}.heading,.body-copy{color:#e6edf2!important}.muted-copy{color:#b8c9d2!important}.eyebrow{color:#a9c8c4!important}.button-cell,.button-link{background:#8dc3c9!important;color:#132a31!important}.code-panel{background:#162229!important;color:#9bd1d7!important}}</style></head><body class="email-background" style="margin:0;padding:0;background:#f6f5f0;color:#173b34;font-family:Arial,Tahoma,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${e(body)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="outer" align="center" style="padding:40px 20px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px"><tr><td style="padding:0 0 24px"><span style="display:inline-block;background:#f7f5ef;padding:10px 14px;border-radius:10px"><img src="${e(origin)}/brand/Primary_Logo.png" width="162" height="60" alt="Capstone Repository" style="display:block;border:0;width:162px;height:60px;object-fit:contain"></span></td></tr><tr><td class="email-card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #dce5de;border-top:4px solid #c7a46a;border-radius:16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td class="content" dir="${ar ? 'rtl' : 'ltr'}" style="padding:36px;text-align:${ar ? 'right' : 'left'}"><p class="eyebrow" style="margin:0 0 14px;color:#4d746a;font-size:12px;line-height:20px;font-weight:bold">${e(label)}</p><h1 class="heading" style="margin:0 0 20px;color:#173b34;font-size:32px;line-height:40px">${e(title)}</h1>${name ? `<p class="body-copy" style="font-size:16px;line-height:26px">${e(name)}</p>` : ''}<p class="body-copy" style="margin:0;color:#38594f;font-size:16px;line-height:27px">${e(body)}</p>${main}<p class="muted-copy" style="color:#587167;font-size:13px;line-height:22px">${e(expiry)}</p>${secondary ? `<p class="muted-copy" dir="${ar ? 'ltr' : 'rtl'}" lang="${ar ? 'en' : 'ar'}" style="border-top:1px solid #dce5de;padding-top:20px;font-size:14px;line-height:24px;color:#587167">${e(secondary)}</p>` : ''}${link ? `<p class="muted-copy" style="margin-top:24px;font-size:12px;line-height:20px;color:#587167">${fallback}</p><p dir="ltr" style="font-size:11px;line-height:18px;word-break:break-all;overflow-wrap:anywhere"><a href="${e(link)}" rel="noreferrer" style="color:#145e56">${e(link)}</a></p>` : ''}</td></tr></table></td></tr><tr><td dir="${ar ? 'rtl' : 'ltr'}" align="center" style="padding:24px 12px"><p class="muted-copy" style="margin:0;color:#587167;font-size:12px;line-height:20px">${ignore}</p><p class="muted-copy" style="color:#587167;font-size:12px">${ar ? 'مستودع مشاريع التخرج' : 'Capstone Repository'}</p></td></tr></table></td></tr></table></body></html>`,
  };
}
