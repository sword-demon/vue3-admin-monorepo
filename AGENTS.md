# Repository Guidelines

## Project Structure & Module Organization
The workspace is managed by `pnpm` and centers on `packages/admin` for the Vue 3 SPA and `packages/shared` for reusable TypeScript utilities. Inside `packages/admin/src`, keep domain logic in `api`, routing in `router`, global state in `stores` (Pinia), layout shells in `layouts`, and view modules under `views`. Local mocks reside in `packages/admin/mock`, while architectural notes live in `packages/admin/docs`. Shared constants or types should originate from `@vue3-admin/shared` to avoid duplication.

## Build, Test, and Development Commands
- `pnpm install`: Restore workspace dependencies with the required versions.
- `pnpm dev`: Launch Vite dev server for `@vue3-admin/admin` with hot reload.
- `pnpm build`: Run `vue-tsc` checks and emit production assets into `packages/admin/dist`.
- `pnpm preview`: Serve the latest production build locally via Vite preview.
- `pnpm lint`: Execute ESLint across the monorepo with autofix; relies on flat config.
- `pnpm format`: Apply Prettier and Stylelint per `lint-staged` conventions.
- `pnpm type-check`: Perform strict TypeScript validation across all packages.

## Coding Style & Naming Conventions
Adopt Prettier defaults (two-space indentation, single quotes in JS/TS, trailing commas where valid). Vue components must use `<script setup>` syntax, PascalCase filenames (for example, `UserTable.vue`), and align with UnoCSS utility classes. Store entities are named `useFeatureStore` and colocated getters/actions. Prefer composition functions under `composables` with `useX` naming. Import cross-package utilities through the alias `@vue3-admin/shared` as defined in `tsconfig.base.json`, keeping relative imports shallow. Any new lint rule adjustments must preserve the existing ESLint + Stylelint pipeline.

## Testing Guidelines
The project currently relies on type safety and manual verification; no automated test runner ships by default. New contributions must include reproducible QA steps in the PR description and ensure `pnpm type-check`, `pnpm lint`, and `pnpm build` succeed. If introducing automated tests, colocate them with the feature (for example, `views/__tests__/`) and extend root scripts to execute them, documenting the setup in `README.md`.

## Commit & Pull Request Guidelines
Commits follow Conventional Commits enforced by Husky + Commitlint (`feat`, `fix`, `docs`, `refactor`, etc.). Keep messages imperative and scoped, such as `fix: handle token refresh retry`. Each PR should reference related issues, summarize architectural impact, and include before/after screenshots for UI updates. Confirm lint, type-check, and build steps pass before requesting review. Highlight any mock data changes and call out impacts on `@vue3-admin/shared` consumers to uphold the monorepo’s single-responsibility boundaries.
