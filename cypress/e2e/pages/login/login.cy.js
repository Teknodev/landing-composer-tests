import data from '@fixtures/data.json';
import { loginPage } from '@pages-po/loginPage';

describe('Login', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('valid credentials → user lands on dashboard', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type(data.email);
    cy.get('[data-cy="password-input"]').should('be.visible').clear().type(data.password);

    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    // User must land on the authenticated home view
    cy.get('[data-cy="header"]', { timeout: 20000 }).should('be.visible');
    cy.url().should('not.include', '/authentication');
  });

  it('invalid password → error toast is shown', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type(data.email);
    cy.get('[data-cy="password-input"]').should('be.visible').clear().type('WrongPass1');

    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    loginPage.verifyToastMessage('Invalid email or password');
  });

  it('non-existent email → error toast is shown', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type('nobody@example.com');
    cy.get('[data-cy="password-input"]').should('be.visible').clear().type(data.password);

    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    cy.get('[data-cy="toast-message"]', { timeout: 8000 }).should('be.visible');
  });

  it('invalid email format → field validation error shown', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type('notanemail');
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    loginPage.requiredErrorMessage('[data-cy="input-email"]', 'Invalid email');
  });

  it('blank submit → required validation on email field', () => {
    loginPage.clickProfileIcon();

    // Submit with empty email
    cy.get('[data-cy="input-email"]').should('be.visible').clear();
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    loginPage.requiredErrorMessage('[data-cy="input-email"]', 'Required');
  });

  it('after valid login, page reload keeps user logged in', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type(data.email);
    cy.get('[data-cy="password-input"]').should('be.visible').clear().type(data.password);
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    cy.get('[data-cy="header"]', { timeout: 20000 }).should('be.visible');

    cy.reload();

    // Session must persist after reload
    cy.get('[data-cy="header"]', { timeout: 20000 }).should('be.visible');
    cy.url().should('not.include', '/authentication');
  });

  it('logout via profile dropdown → redirected to auth page', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type(data.email);
    cy.get('[data-cy="password-input"]').should('be.visible').clear().type(data.password);
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();

    cy.get('[data-cy="header"]', { timeout: 20000 }).should('be.visible');

    // Open profile dropdown
    cy.get('[data-cy="header-right"] [data-cy="profile-button"]', { timeout: 10000 }).should('be.visible').click();

    // Click logout
    cy.get('[data-cy="profile-menu-logout"]').should('be.visible').click();

    // Must redirect to auth
    cy.url({ timeout: 10000 }).should('include', '/authentication');
  });

  it('multiple failed login attempts each show the error toast', () => {
    loginPage.clickProfileIcon();

    cy.get('[data-cy="input-email"]').should('be.visible').clear().type(data.email);
    cy.get('[data-cy="password-input"]').should('be.visible').clear().type('WrongPass1');

    // First attempt
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();
    loginPage.verifyToastMessage('Invalid email or password');
    cy.get('[data-cy="toast-close-btn"]').should('be.visible').click();
    cy.get('[data-cy="toast-message"]').should('not.exist');

    // Second attempt
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();
    loginPage.verifyToastMessage('Invalid email or password');
    cy.get('[data-cy="toast-close-btn"]').should('be.visible').click();
    cy.get('[data-cy="toast-message"]').should('not.exist');

    // Third attempt
    cy.get('[data-cy="signin-btn"]').should('be.visible').click();
    loginPage.verifyToastMessage('Invalid email or password');
  });
});
