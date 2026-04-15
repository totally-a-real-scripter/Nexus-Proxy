/**
 * Scramjet Configuration
 * Scramjet is a more modern alternative to UV with better JS rewriting.
 * It intercepts fetches/XHR at the service worker level and rewrites
 * all URLs through the proxy prefix.
 */
self.__scramjet$config = {
  prefix:  "/scram/",
  bare:    "/bare/",
  codec: {
    encode: (url) => btoa(url).replace(/=/g, ""),
    decode: (url) => atob(url),
  },
};
