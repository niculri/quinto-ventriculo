// HTML to plain text without dependencies, for the web and the Worker. A note's form decodes every entity, so it
// has its own entry (`@qv/html/note-text`); Anki's own forms stay with the Anki port, in anki-render.
export { ankiPlainText, releasePlainText, reportPlainText } from './plain';
