/**
 * Block Builder — save, re-open, save again.
 *
 * A component built from scratch has no blueprint, so re-opening it in Block
 * Builder runs the saved bundle and reads the tree back out of what it
 * rendered. Anything that read-back cannot recognise does not just look wrong
 * on screen: it is saved as-is and read again next time, so the component
 * drifts further from itself on every trip — wrappers the user never added
 * piling up, text they typed coming back blank.
 *
 * These specs drive the real editor: the saved bundle below is the shape the
 * generator actually emits (one `.map()` over a `buttons` array, each entry
 * wrapped in a ComposerLink, each label rendered through the inline editor).
 * Every request is stubbed, so nothing is written to the project.
 */

import { loginToEditor } from '@support/editorTestHelper';

const PROJECT_ID = Cypress.env('TEST_PROJECT_ID') || '69f515295ac7bd7572f9590c';
const COMPONENT_NAME = 'Round Trip Buttons';
const COMPONENT_ID = 'cc-round-trip';
const BB_URL =
  `/project/${PROJECT_ID}/blockbuilder` +
  `?component=${encodeURIComponent(COMPONENT_NAME)}&customComponentId=${COMPONENT_ID}`;

/**
 * A saved component, exactly as Quick Save writes one: the button array lives
 * in `addProp`, the render maps over it, and an entry with neither text nor
 * icon draws nothing — the same rule the editor follows.
 */
const savedBundle = (labels) => `
  (function() {
    var _CT = window.ComposerTools;
    var Component = _CT.Component;
    var Base = _CT.Base;
    var React = window.React;
    var ComposerLink = _CT.ComposerLink || function(props) { return props.children; };

    var styles = { "row": "RoundTrip_v1_row", "button": "RoundTrip_v1_button", "label": "RoundTrip_v1_label" };

    class RoundTrip_v1 extends Component {
      constructor(props) {
        super(props, styles);
        this.addProp({
          type: "array", key: "buttons", displayer: "Buttons",
          value: ${JSON.stringify(labels)}.map(function (text) {
            return {
              type: "object", key: "button", displayer: "Button",
              value: [
                { type: "string", key: "text", displayer: "Text", value: text },
                { type: "page", key: "url", displayer: "Navigate To", value: "" },
                { type: "media", key: "icon", displayer: "Icon", additionalParams: { availableTypes: ["icon"] }, value: { type: "icon", name: "" } }
              ]
            };
          })
        });
      }

      static getName() { return ${JSON.stringify(COMPONENT_NAME)}; }
      static getCategory() { return "custom"; }

      render() {
        return (
          React.createElement("div", { className: this.decorateCSS("row") },
            this.castToObject("buttons").map(function (btn, idx) {
              if (!this.castToString(btn.text) && !(btn.icon && btn.icon.name)) return null;
              return React.createElement(ComposerLink, { key: idx, path: btn.url },
                React.createElement(Base.Button, { className: this.decorateCSS("button") },
                  React.createElement(Base.P, { className: this.decorateCSS("label") }, btn.text)
                )
              );
            }, this)
          )
        );
      }
    }

    window.__CUSTOM_COMPONENTS__["RoundTrip_v1"] = RoundTrip_v1;
  })();
`;

const componentMeta = (labels) => [
  {
    _id: COMPONENT_ID,
    name: COMPONENT_NAME,
    category: 'custom',
    version: 1,
    bundle_url: '',
    bundle_content: savedBundle(labels),
    styles_url: '',
    styles_content: '',
    status: 'active',
    props_schema: '[]',
  },
];

/** Quick Save base64-encodes through UTF-8; undo both to read the payload. */
const decode = (b64) => decodeURIComponent(escape(atob(b64)));

const buttonTexts = (propsSchema) => {
  const buttons = JSON.parse(propsSchema).find((p) => p.key === 'buttons');
  if (!buttons) {
    throw new Error(`no "buttons" prop — got ${JSON.parse(propsSchema).map((p) => p.key).join(', ')}`);
  }
  return buttons.value.map((entry) => entry.value.find((f) => f.key === 'text').value);
};

/** Stubs the three calls Quick Save makes, and captures the upload. */
const stubComponentApi = (labels) => {
  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}/custom-components`, {
    body: componentMeta(labels),
  }).as('listComponents');

  cy.intercept('GET', `**/v1/projects/${PROJECT_ID}/custom-components/${COMPONENT_ID}/versions`, {
    body: [{ version: 1 }],
  }).as('listVersions');

  // Stubbed so the run never writes a component into the project.
  cy.intercept('POST', `**/v1/projects/${PROJECT_ID}/custom-components`, {
    statusCode: 200,
    body: { _id: COMPONENT_ID, name: COMPONENT_NAME, version: 2 },
  }).as('uploadComponent');
};

const openInBlockBuilder = () => {
  cy.visit(BB_URL);
  cy.get('[data-cy="bb-canvas-area"]', { timeout: 30000 }).should('be.visible');
  // The canvas only fills once the saved bundle has been fetched and run.
  cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.Button"]', { timeout: 30000 })
    .should('exist');
};

describe('Block Builder — re-opening a saved component', () => {
  beforeEach(() => {
    loginToEditor();
  });

  it('shows the buttons the saved component draws, and nothing else', () => {
    stubComponentApi(['Next', 'Back']);
    openInBlockBuilder();

    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.Button"]').should('have.length', 2);

    // The link the generator wraps each button in is plumbing, not content. Read
    // back as an element it would be saved as one, and the next save would wrap
    // that again — one more layer around the same button every trip.
    cy.get('[data-cy="bb-node-interactive"][data-component-name="a"]').should('not.exist');

    // Likewise the span the inline editor wraps a string prop in.
    cy.get('[data-cy="bb-node-interactive"][data-component-name="span"]').should('not.exist');

    cy.get('[data-cy="bb-canvas-area"]').should('contain.text', 'Next').and('contain.text', 'Back');
  });

  it('quick saves the same array it was opened with', () => {
    stubComponentApi(['Next', 'Back']);
    openInBlockBuilder();

    cy.get('[data-cy="bb-quick-save"]').should('be.enabled').click();

    cy.wait('@uploadComponent').then(({ request }) => {
      const { name, version, props_schema: propsSchema, bundle } = request.body;

      expect(name, 'saved under the bare name').to.equal(COMPONENT_NAME);
      expect(version, 'next version after the one on record').to.equal(2);

      // One array, under the key it already had. Wrapped in a fresh array of its
      // own — `buttons` becoming `divItems → item → buttons` — the component
      // gains a level of nesting on every save.
      const keys = JSON.parse(propsSchema).map((p) => p.key);
      expect(keys, 'no array wrapped around the array').to.deep.equal(['buttons']);
      expect(buttonTexts(propsSchema), 'both labels survived the trip').to.deep.equal(['Next', 'Back']);

      const renderBody = decode(bundle).split('render()')[1];
      expect(
        (renderBody.match(/castToObject\("buttons"\)\.map/g) || []).length,
        'the array is written out once'
      ).to.equal(1);
    });
  });

  it('keeps an entry the component does not draw', () => {
    // The middle button has nothing in it, so the component skips it the way the
    // editor does. The tree is a shorter view of the array, not the user
    // deleting an entry — a save must not drop it.
    stubComponentApi(['Next', '', 'Back']);
    openInBlockBuilder();

    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.Button"]').should('have.length', 2);

    cy.get('[data-cy="bb-quick-save"]').should('be.enabled').click();

    cy.wait('@uploadComponent').then(({ request }) => {
      expect(buttonTexts(request.body.props_schema)).to.deep.equal(['Next', '', 'Back']);
    });
  });

  it('leaves the editor on the path it came from', () => {
    stubComponentApi(['Next', 'Back']);
    cy.visit(BB_URL, {
      onBeforeLoad(win) {
        win.sessionStorage.setItem('blockbuilder:returnPath', `/project/${PROJECT_ID}/editor/0`);
      },
    });
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.Button"]', { timeout: 30000 })
      .should('exist');

    cy.get('[data-cy="bb-quick-save"]').click();
    cy.wait('@uploadComponent');

    cy.location('pathname', { timeout: 20000 }).should('eq', `/project/${PROJECT_ID}/editor/0`);
    // What the editor reads to refresh the section it just sent to the builder.
    cy.window().then((win) => {
      const update = JSON.parse(win.sessionStorage.getItem('blockbuilder:componentUpdate'));
      expect(update).to.deep.equal({ name: COMPONENT_NAME, version: 2 });
    });
  });
});

describe('Block Builder — quick saving a component built from scratch', () => {
  beforeEach(() => {
    loginToEditor();
    stubComponentApi(['Next', 'Back']);
  });

  it('uploads what the canvas holds', () => {
    cy.visit(`/project/${PROJECT_ID}/blockbuilder?component=${encodeURIComponent(COMPONENT_NAME)}`);
    cy.get('[data-cy="bb-canvas-area"]', { timeout: 30000 }).should('be.visible');

    cy.get('[data-cy="palette-item-Base.Container"]').drag('[data-cy="bb-root-drop-zone"]');
    cy.get('[data-cy="bb-rendered-container"]').first().should('exist').as('container');

    cy.get('[data-cy="palette-item-Base.P"]').drag('@container');
    cy.get('[data-cy="bb-node-interactive"][data-component-name="Base.P"]').should('exist');

    cy.get('[data-cy="bb-quick-save"]').click();

    cy.wait('@uploadComponent').then(({ request }) => {
      const bundle = decode(request.body.bundle);
      expect(bundle, 'the paragraph reached the bundle').to.contain('Base.P');
      expect(request.body.styles, 'styles are uploaded alongside').to.be.a('string');
      expect(request.body.version).to.equal(2);
    });
  });
});
