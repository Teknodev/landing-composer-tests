const VERSIONS_LIST = '**/v1/projects/*/versions';
const VERSION_WRITE = '**/v1/projects/*/versions/*';

const buildVersion = (id, order, current = false) => {
  const project = { pages: [], sections: [] };
  return {
    _id: id,
    name: `Cypress Version ${order}`,
    order,
    current,
    published: false,
    custom: false,
    owner: { _id: 'cy-owner', name: 'Cypress Owner' },
    project,
    data: JSON.stringify(project),
    created_at: new Date(2026, 0, order).toISOString(),
  };
};

const VERSIONS = [
  buildVersion('cy-version-current', 3, true),
  buildVersion('cy-version-a', 2),
  buildVersion('cy-version-b', 1),
];

const stubVersionsApi = () => {
  cy.intercept('GET', VERSIONS_LIST, {
    statusCode: 200,
    body: { versions: VERSIONS },
  }).as('getVersions');

  cy.intercept({ method: 'POST', url: VERSION_WRITE }, { statusCode: 200, body: {} }).as('versionPost');
  cy.intercept({ method: 'PATCH', url: VERSION_WRITE }, { statusCode: 200, body: {} }).as('versionPatch');
};

const visitTestProjectEditor = () => {
  cy.login();
  cy.getTestProjectId().then((projectId) => {
    cy.visit(`/project/${projectId}/editor/0`);
  });
  cy.get('[data-component-index], [data-cy="add-component-placeholder"]', { timeout: 30000 }).should('exist');
};

const openVersionManager = () => {
  cy.get('[data-cy="open-version-history"] [data-cy="toolbar-icon-versionManager"]', { timeout: 15000 }).click({ force: true });
  cy.wait('@getVersions');
  cy.get('[data-cy="version-list"]').should('exist');
};

const clickCard = (id) => {
  cy.get(`[data-cy="version-item-${id}"]`).should('exist').children().first().click({ force: true });
};

const assertNoVersionWrites = () => {
  cy.get('[data-cy="version-list"]').should('exist');
  cy.get('@versionPost.all').should('have.length', 0);
  cy.get('@versionPatch.all').should('have.length', 0);
};

describe('Version Manager - Preview', () => {
  beforeEach(() => {
    stubVersionsApi();
    visitTestProjectEditor();
    openVersionManager();
  });

  it('N1: card click opens the preview strip and sends no POST or PATCH', () => {
    cy.get('[data-cy="version-preview-strip"]').should('not.exist');

    clickCard(VERSIONS[1]._id);

    cy.get('[data-cy="version-preview-strip"]').should('contain.text', VERSIONS[1].name);
    cy.get('[data-cy="version-preview-exit-btn"]').should('exist');
    cy.get('[data-cy="version-preview-restore-btn"]').should('exist');
    assertNoVersionWrites();
  });

  it('M1: Exit preview removes the strip and sends no request', () => {
    clickCard(VERSIONS[1]._id);
    cy.get('[data-cy="version-preview-strip"]').should('exist');

    cy.get('[data-cy="version-preview-exit-btn"]').click({ force: true });

    cy.get('[data-cy="version-preview-strip"]').should('not.exist');
    assertNoVersionWrites();
  });

  it('M2: Restore to draft sends exactly one POST to the previewed version and no PATCH', () => {
    clickCard(VERSIONS[1]._id);
    cy.get('[data-cy="version-preview-strip"]').should('exist');
    cy.get('[data-cy="version-preview-exit-btn"]').click({ force: true });
    cy.get('[data-cy="version-preview-strip"]').should('not.exist');

    clickCard(VERSIONS[2]._id);
    cy.get('[data-cy="version-preview-strip"]').should('contain.text', VERSIONS[2].name);
    assertNoVersionWrites();

    cy.get('[data-cy="version-preview-restore-btn"]').click({ force: true });

    cy.wait('@versionPost').its('request.url').should('match', new RegExp(`/versions/${VERSIONS[2]._id}$`));
    cy.get('@versionPost.all').should('have.length', 1);
    cy.get('@versionPatch.all').should('have.length', 0);
  });
});
