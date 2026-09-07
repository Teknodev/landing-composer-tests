const TOOL_NAME_LEAK_REGEX = /\b(?:pb_|bb_|ct_|dt_|int_|ab_|gc_|cc_|seo_|pub_|rev_|forms_|wh_|code_|modal_|media_|cms_|dom_|l10n_|theme_|acc_)[a-z0-9_]*\b|\brequest_confirmation\b|\bregenerate_section_text\b|\blist_projects\b/i;
const HEX_ID_LEAK_REGEX = /\b[a-f0-9]{24}\b/i;
const INDEX_LEAK_REGEX = /\b(?:at\s+)?index\s+\d+\b|\(section\s*#\d+\)/i;

export function assertNoInternalLeak(text) {
  expect(text, `no internal tool name leak in "${text}"`).to.not.match(TOOL_NAME_LEAK_REGEX);
  expect(text, `no 24-char hex id leak in "${text}"`).to.not.match(HEX_ID_LEAK_REGEX);
  expect(text, `no numeric index leak in "${text}"`).to.not.match(INDEX_LEAK_REGEX);
}
