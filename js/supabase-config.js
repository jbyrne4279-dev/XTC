/* XTC Clothing — shared Supabase client.
   A single client instance must be used across all pages: creating separate
   clients per page (each with persistSession) makes them race over the same
   localStorage session token — one client's refresh can wipe the session the
   other just wrote, logging the user out on navigation. */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://mugifniadilfwfgrsvie.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im11Z2lmbmlhZGlsZndmZ3JzdmllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTgxNzMsImV4cCI6MjA5NzI3NDE3M30.95VqWUKCcMeCCQON13Fy_USoGccoyCwVBRtKbp-aB60';

  // In-memory lock instead of the default navigator.locks-based one. The Web
  // Locks API is buggy in iOS Safari / in-app webviews: the auth lock can
  // hang, the token refresh then fails, and supabase-js wipes the stored
  // session — which logs the user out (often after switching apps and back).
  // This in-memory lock serialises auth calls without that hazard.
  var _authLockChain = Promise.resolve();
  function inMemoryLock(name, acquireTimeout, fn) {
    var run = _authLockChain.then(fn, fn);
    _authLockChain = run.then(function () {}, function () {});
    return run;
  }

  window._supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, lock: inMemoryLock },
  });
})();
