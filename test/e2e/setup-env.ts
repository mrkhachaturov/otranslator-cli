// Load .env so e2e tests pick up OTRANSLATOR_API_KEY without requiring the
// runner to export variables manually. Safe to import unconditionally — dotenv
// silently no-ops when no .env file is present.
import 'dotenv/config';
