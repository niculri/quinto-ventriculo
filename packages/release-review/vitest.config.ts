// Vitest project of the release review package, without a DOM.
import { defineProject } from 'vitest/config';

export default defineProject({ test: { name: 'release-review' } });
