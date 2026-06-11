# Admin UI redesign — shadcn/ui + Tailwind (2026-06-11)

## Goal
Replace inline-styled admin with shadcn/ui (Radix + Tailwind v4). Sidebar
app-shell, light+dark toggle, full refactor of 13 admin components. Public site
untouched.

## Constraints
- C1: Tailwind ! leak to public. admin & public = separate root-layout trees
  (no shared app/layout.tsx). `admin.css` (`@import "tailwindcss"`) imported
  ONLY in admin/layout.tsx → loads only on /admin routes. Preflight scoped.
- C2: React 19 + Next 16. shadcn latest supports both. Tailwind v4 CSS-first.
- C3: keep my TagInput/UrlListInput/MenuTreeEditor logic — restyle only (shadcn
  has no tags-input). i18n (next-intl) + dark cookie both read in admin layout.

## Stack
- tailwindcss v4 + @tailwindcss/postcss; cn() = clsx + tailwind-merge
- shadcn components copied into components/ui/: button, input, label, select,
  checkbox, switch, card, dialog, dropdown-menu, table, badge, tabs, textarea,
  separator, sonner (toast)
- dark mode: cookie `admin_theme` read server-side in admin/layout → `.dark`
  class on <html>; client toggle sets cookie + toggles class. No next-themes.

## Layout (AppShell)
- admin/layout.tsx: `<html class={theme}>` → flex: fixed sidebar (w-60) + main.
- Sidebar: brand, nav links (icon + label, active state via usePathname),
  collapses to icons on <md. Bottom: theme toggle + locale + user + logout.
- Each admin page = Card-wrapped content, consistent h1 + actions row.

## Refactor map (inline → shadcn)
- inputs.tsx: TagInput→Badge chips + Input; LocaleSelect→Select; CheckboxGroup→
  Checkbox; Toggle→Switch; Field→Label+helper text
- site-forms, simple-managers (redirects/menus/webhooks), authors-manager,
  gsc-dashboard, pages-table, page-forms, members, menu-editor → Card/Table/
  Dialog/Button/Input/Select; toasts via sonner replace inline messages
- version-diff/versions-panel → Card; editor-client (Puck) → restyle chrome only
- locale-switcher → shadcn Select; add theme-toggle

## Waves
1. Foundation: tailwind+postcss+admin.css+tokens+cn+dark+core ui comps. Build-gate.
2. AppShell sidebar + theme toggle + nav.
3. inputs.tsx + Field restyle.
4. Sites, Pages, Menus.
5. Media, Webhooks, Authors, GSC, Redirects, Members, versions.
6. Verify: build, lint, typecheck, e2e (login+i18n), browser screenshots, commit.

## Verify
Each wave: tsc + build. Final: lint, web tests, e2e 3/3, Playwright browser
smoke (login → Sites/Menus render, dark toggle), public site visually unchanged.
