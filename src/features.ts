/**
 * Switches for parts of the app that are built but hidden.
 *
 * Investing (the Investments tab, net worth, "where should new money go", and the Plan tab's advice on where to
 * invest) is off for now. Nothing is deleted: saved holdings stay in the user's data and the code is intact.
 * To bring it back, build or run with VITE_FEATURE_INVESTING=1.
 */
export const features = {
  investing: import.meta.env.VITE_FEATURE_INVESTING === '1',
} as const;
