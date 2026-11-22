// What qv/no-literal-text reads as text besides the HTML and ARIA text attributes.

// The text props of the web's components (not `name`, which is also a form control's name), the props that take a list
// of texts (with the keys of their items that are text), the functions whose arguments are all text, and those whose
// are never (keys, locales).
export const LITERAL_TEXT = {
  componentTextProps: [
    'againLabel',
    'busyLabel',
    'confirm',
    'empty',
    'heading',
    'help',
    'longest',
    'message',
    'sectionLabel',
    'sectionName',
    'text',
    'unit',
    'why',
  ],
  listProps: ['choices', 'columns', 'items', 'lines', 'options'],
  textKeys: ['description', 'help', 'label', 'text', 'title'],
  textFunctions: ['plural', 'pluralGrouped'],
  ignoreFunctions: ['keys', 'shortcut', 'toLocaleString'],
};
