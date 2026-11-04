/**
 * Where the links in confirmation and password-reset emails should lead.
 * In a browser that is the page itself. Inside the Android and iOS apps the page's address is only `https://localhost`, which means
 * nothing on a phone's browser, so the links go to the public website instead (VITE_WEB_URL). The person confirms there and signs in in the app.
 */
export function redirectFor(native: boolean, webUrl: string | undefined, origin: string, pathname: string): string {
  const site = webUrl?.trim();
  if (native && site) return site.endsWith('/') ? site : `${site}/`;
  return origin + pathname;
}
