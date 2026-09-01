// ***********************************************************
// This example support/e2e.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands'

// Import cypress-drag-drop globally so all test files can use .drag()
import '@4tw/cypress-drag-drop'

// Import cypress-real-events globally so all test files can use .realHover()
// — MUI Tooltip only opens on a trusted mouse event; cy.trigger() dispatches
// an untrusted synthetic event that MUI silently ignores.
import 'cypress-real-events'

// ---------------------------------------------------------------------------
// Observability: surface the RoleBasedGuard "no access" path as a visible
// Cypress error rather than letting it silently redirect to "/".
//
// When the SPA's RoleBasedGuard denies access it (a) shows a toast
// "You do not have access to this page." and (b) calls navigate("/"). In a
// failing run the user landed on "/" but the failure cause is hidden — the
// spec assertion fails on a path mismatch (`expected '/' to include
// '/project/...'`) without surfacing the underlying guard denial.
//
// This handler watches uncaught exceptions from the SPA. If the access-denied
// message shows up there (e.g. via a thrown notification), we re-throw so the
// Cypress runner records it. For the common path (notificationService toast
// without throw), the warning still surfaces in the browser console — visible
// when the spec is opened in `cypress open`.
// ---------------------------------------------------------------------------
Cypress.on('uncaught:exception', (err) => {
  const message = (err && err.message) || '';
  // Surface the RoleBasedGuard access-denied path with a clear, attributable
  // error. Returning `true` re-throws into the test; returning `false` swallows.
  if (message.includes('You do not have access to this page.')) {
    // eslint-disable-next-line no-console
    console.error('[e2e.js] RoleBasedGuard denied access — surfacing as test failure:', message);
    return true;
  }
  // Swallow webfontloader's "No fonts to load!" — this is an unhandled
  // promise rejection from the webfontloader vendor lib when a project's
  // font config resolves to an empty set. It's benign and has no UX impact,
  // but Cypress's default behavior is to fail the test on any uncaught
  // exception. Returning `false` tells Cypress to ignore it.
  if (message.includes('No fonts to load!')) {
    return false;
  }
  // Default: do not swallow other exceptions either — let them fail the test
  // so they aren't hidden. Cypress's default is also `true`.
  return true;
});
