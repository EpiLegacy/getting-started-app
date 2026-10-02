# Accessibility (RGAA)

Todo App targets the **RGAA 4.1.2** (*Référentiel général d'amélioration de l'accessibilité*), the French accessibility standard. This page explains what the standard asks for, how the application was audited, and the result criterion by criterion. The public summary is the accessibility statement at [`/accessibility`](../src/client/pages/AccessibilityPage.tsx), linked from the footer of every page.

**Result of the audit of 2 October 2026: partially compliant, 98% of the applicable criteria met (55 of 56).** The one criterion left, 7.1, needs a pass with a screen reader before it can be declared compliant.

## What the RGAA is

- **Legal basis.** Article 47 of law no. 2005-102 of 11 February 2005, and decree no. 2019-768. Public bodies, and private companies with a turnover above 250 million euros, must make their websites, intranets and mobile applications accessible. Since 28 June 2025, the European Accessibility Act extends this to many private consumer services (e-commerce, banking, transport...).
- **Content.** 106 criteria in 13 themes: images, frames, colours, multimedia, tables, links, scripts, mandatory elements, structure, presentation, forms, navigation, consultation. Each criterion is checked through one or more tests, with a methodology for each test.
- **Relation to WCAG.** The RGAA is the French method to test conformance with **WCAG 2.1 level AA**, through the European standard EN 301 549. A site compliant with the RGAA is compliant with WCAG 2.1 AA.
- **Result.** Each criterion is compliant (C), non-compliant (NC) or not applicable (NA). The compliance rate is C / (C + NC). A site is *totally compliant* at 100%, *partially compliant* from 50%, and *non-compliant* below 50%.

### What the law requires besides the criteria

| Obligation | Where it is in Todo App |
|---|---|
| An **accessibility statement**: status, rate, non-accessible content, test environment, a way to report a problem, the remedy through the Défenseur des droits | [`/accessibility`](../src/client/pages/AccessibilityPage.tsx) |
| A mention **"Accessibility: totally / partially / not compliant"** on every page, linking to the statement | Footer, [`AppLayout.tsx`](../src/client/app/AppLayout.tsx) |
| A **multi-year accessibility plan** (*schéma pluriannuel*, 3 years) and a yearly action plan | Organisational, not in scope for this project; the follow-up list below plays that role |
| Penalties | Up to 50,000 euros per non-compliant service, renewable every six months while it stays non-compliant; 25,000 euros when the statement or the multi-year plan is missing ([Access42 summary](https://access42.net/ressources/accessibilite-rgaa-obligations-legales/)) |

## How the application was audited

Two complementary methods, because no tool can check the whole standard. Tools catch about a third of the criteria; the rest (is this label meaningful? is this heading relevant?) needs a person.

1. **Automated, in CI.** [`e2e/accessibility.spec.ts`](../e2e/accessibility.spec.ts) opens every page in Chromium, signed in and signed out, and runs **axe-core** against the WCAG 2.1 A and AA rules: contrast, names, labels, landmarks, headings, language, ARIA. It also checks what axe cannot:
   - the skip link is the first tab stop and lands on the main content;
   - a client-side navigation sets a new page title and moves the focus to the new page;
   - focused controls show a solid outline;
   - every page reflows at 320 px without horizontal scrolling;
   - the page can be zoomed.

   The *Accessibility* job in [`ci.yml`](../.github/workflows/ci.yml) runs it on every pull request. Locally: build the app, migrate a database, then `npm run test:a11y` (see the header of [`playwright.config.ts`](../playwright.config.ts)).
2. **Manual.** Every criterion below was reviewed against the source code and the running application, keyboard only.

Not done yet: a pass with a screen reader (NVDA on Windows, VoiceOver on macOS). It is the next step of the follow-up list.

### Pages audited

Sign in, Create an account, Home, My tasks (the Kanban board, empty and with tasks of every priority, and the add task dialog), Your profile with the account deletion dialog, Accessibility statement, Site map, Page not found.

## What changed to get there

| Before | After | Criterion |
|---|---|---|
| `<html>` had no `lang` | `lang="en"` | 8.3 |
| The viewport blocked zooming (`maximum-scale=1, user-scalable=0`) | Zoom allowed | 10.4 |
| Every page was titled "Todo App" | One title per route, e.g. "My tasks - Todo App" | 8.6 |
| The app name was an `h6` before each page's `h1`; My tasks had no `h1` | One `h1` per page, first in the outline | 9.1 |
| No skip link; the focus stayed in the menu after a navigation | "Skip to main content" first; focus moves to the new page | 12.7, 7.4 |
| No `header` or `footer`; menu items not in a list | header, nav, main, footer landmarks; menus as lists | 9.2, 9.3, 12.6 |
| Primary blue at 4.0:1 on grey and alert backgrounds | `#1565c0`, 5.1:1 or more | 3.2 |
| Field outlines at 1.6:1 | 5.7:1 | 3.3 |
| Keyboard focus shown only by a faint ripple | 3 px solid outline | 10.7 |
| Completed tasks faded with `opacity: 0.6` (4.1:1) | `#595959` on `#f5f5f5` (6.4:1) | 3.2 |
| Animations played regardless of user settings | Stopped under `prefers-reduced-motion` | 13.8 |
| Search field labelled "Name" | "Search by name" | 11.2 |
| Only one navigation system | Site map, linked from every page | 12.1, 12.3, 12.4 |
| Board cards could only be moved by dragging them with a mouse | A Status select on every card, usable from the keyboard and on touch screens | 7.1, 7.3, 13.10 |
| Moving or deleting a task or a project gave no feedback to screen readers | Announced in a live region | 7.5 |
| Board columns and cards were untitled `div`s | h2 sections, h3 columns with their task count, h4 cards, as lists | 9.1, 9.3 |
| Deadline, priority and assignee were only named in mouse tooltips | Written on the card: "Due …", "Priority: …", "Assigned to …" | 10.13, 3.1 |
| The medium priority chip was white on orange, 3.1:1 | `#b45309`, 5.0:1 | 3.2 |
| The task form was a bare Modal, 400 px wide, in French | A named Dialog that fits 320 px, in English like the rest of the interface | 7.1, 8.7, 10.11 |
| No statement | Statement and footer mention | Legal obligation |

## Audit grid

| Criterion | | Result | Notes |
|---|---|---|---|
| **1. Images** | | | |
| 1.1 | Informative images have a text alternative | NA | No informative image: every icon sits next to a visible label or inside a named button. |
| 1.2 | Decorative images are ignored by assistive technologies | C | MUI icons render with aria-hidden="true". |
| 1.3 | Text alternatives are relevant | NA |  |
| 1.4 | CAPTCHA / test images: alternative identifies them | NA |  |
| 1.5 | CAPTCHA: an alternative access is offered | NA |  |
| 1.6 | Informative images have a detailed description if needed | NA |  |
| 1.7 | Detailed descriptions are relevant | NA |  |
| 1.8 | Images of text are replaced by styled text | NA |  |
| 1.9 | Image captions are associated with their image | NA |  |
| **2. Frames** | | | |
| 2.1 | Frames have a title | NA | No iframe. |
| 2.2 | Frame titles are relevant | NA |  |
| **3. Colours** | | | |
| 3.1 | Information is not conveyed by colour alone | C | Completed tasks are struck through and their checkbox is ticked; errors are written out. |
| 3.2 | Text contrast is at least 4.5:1 (3:1 for large text) | C | Primary darkened to #1565c0 (5.1:1 or more on every background); the medium priority chip from #ed6c02 (3.1:1) to #b45309 (5.0:1). Checked by axe on every page, board included. |
| 3.3 | Interface components and graphics reach 3:1 | C | Field outlines raised from 1.6:1 to 5.7:1; focus ring #1565c0. |
| **4. Multimedia** | | | |
| 4.1 | Pre-recorded media have a transcript or audio description | NA | No audio or video. |
| 4.2 | Those alternatives are relevant | NA |  |
| 4.3 | Synchronised media have captions | NA |  |
| 4.4 | Captions are relevant | NA |  |
| 4.5 | Pre-recorded media have audio description | NA |  |
| 4.6 | Audio descriptions are relevant | NA |  |
| 4.7 | Media are clearly identifiable | NA |  |
| 4.8 | Non-temporal media have an alternative | NA |  |
| 4.9 | That alternative is relevant | NA |  |
| 4.10 | Automatic sound can be controlled | NA |  |
| 4.11 | Media can be controlled from the keyboard | NA |  |
| 4.12 | Non-temporal media are keyboard and pointer accessible | NA |  |
| 4.13 | Media are compatible with assistive technologies | NA |  |
| **5. Tables** | | | |
| 5.1 | Complex data tables have a summary | NA | The projects table is simple: one header row. |
| 5.2 | Those summaries are relevant | NA |  |
| 5.3 | Layout tables stay understandable when linearised | NA | No layout table. |
| 5.4 | Data table titles are associated with their table | NA |  |
| 5.5 | Data table titles are relevant | NA |  |
| 5.6 | Header cells are declared | C | MUI TableHead renders <th scope="col">. |
| 5.7 | The right technique associates cells with headers | C |  |
| 5.8 | Layout tables do not use data table markup | NA |  |
| **6. Links** | | | |
| 6.1 | Links are explicit | C | Every link names its destination, e.g. "View my tasks", "Back to home". |
| 6.2 | Every link has a name | C |  |
| **7. Scripts** | | | |
| 7.1 | Scripted components are compatible with assistive technologies | NC | Names, roles and states pass in Chromium (axe), and the task form is now a real dialog. Not yet verified with a screen reader, which the RGAA method requires for this criterion. |
| 7.2 | Script alternatives are relevant | NA |  |
| 7.3 | Scripted components are keyboard and pointer operable | C | MUI controls. Board cards move by drag and drop or with a Status select on each card, tested from the keyboard in CI. |
| 7.4 | Changes of context are announced or user-initiated | C | Only form submissions and links change the page. |
| 7.5 | Status messages are rendered by assistive technologies | C | Loading states use role="status", errors and confirmations role="alert". Moving or deleting a task or a project is announced in a live region. |
| **8. Mandatory elements** | | | |
| 8.1 | Every page has a doctype | C |  |
| 8.2 | Generated code is valid | C | No duplicate id or invalid ARIA (axe). |
| 8.3 | The default language is declared | C | <html lang="en">, previously missing. |
| 8.4 | The language code is relevant | C |  |
| 8.5 | Every page has a title | C |  |
| 8.6 | Page titles are relevant | C | Each route sets its own title, previously "Todo App" everywhere. |
| 8.7 | Changes of language are declared | C | The whole interface is in English; the board and its dialogs were translated from French. |
| 8.8 | Language codes of those changes are relevant | C | The French address on the statement page carries lang="fr". |
| 8.9 | Tags are not used only for presentation | C |  |
| 8.10 | Changes of reading direction are declared | NA |  |
| **9. Structure** | | | |
| 9.1 | Information is structured with relevant headings | C | One h1 per page; the board has h2 sections, h3 columns (with their task count) and h4 cards. |
| 9.2 | The document outline is coherent (header, nav, main, footer) | C | Landmarks added: header, nav, main, footer. |
| 9.3 | Lists are marked up as lists | C | Navigation menu, footer, tasks due today, board columns, project members, unassigned tasks, site map. |
| 9.4 | Quotations are marked up | NA |  |
| **10. Presentation** | | | |
| 10.1 | Style sheets control presentation | C |  |
| 10.2 | Visible content stays present without CSS | C |  |
| 10.3 | Information stays understandable without CSS | C |  |
| 10.4 | Text stays readable at 200% zoom | C | The viewport no longer sets maximum-scale or user-scalable=0. |
| 10.5 | Foreground and background colours are declared together | C |  |
| 10.6 | Links in text are distinguishable | C | Underlined. |
| 10.7 | Keyboard focus is visible | C | Solid 3px ring on every focusable element; MUI only showed a ripple. |
| 10.8 | Hidden content is meant to be ignored | C |  |
| 10.9 | Information is not conveyed by shape, size or position alone | C |  |
| 10.10 | Same, correctly implemented | C |  |
| 10.11 | Content reflows at 320 px without two-dimensional scrolling | C | Every page and the task dialog, checked in CI. The projects table scrolls on its own, which data tables may. |
| 10.12 | Text spacing can be increased without loss | C |  |
| 10.13 | Content shown on hover or focus can be controlled | NA | No tooltip: the board's deadline, priority and assignee labels are written on the cards. |
| 10.14 | Content shown on hover is also reachable from the keyboard | NA |  |
| **11. Forms** | | | |
| 11.1 | Every field has a label | C |  |
| 11.2 | Labels are relevant | C | The search field is now "Search by name", not "Name". |
| 11.3 | Labels are consistent across the site | C |  |
| 11.4 | Labels sit next to their field | C |  |
| 11.5 | Related fields are grouped | NA |  |
| 11.6 | Groups have a legend | NA |  |
| 11.7 | Legends are relevant | NA |  |
| 11.8 | Options of select lists are grouped when needed | NA |  |
| 11.9 | Button names are relevant | C | Icon buttons are named ("Delete the task <name>"); repeated buttons name their project and keep their visible text ("Add member to <project>"). |
| 11.10 | Input control is used appropriately (required fields, formats, errors) | C | required attributes, "All fields are required" in the task dialog, password length announced through aria-describedby, errors in role="alert". |
| 11.11 | Errors come with suggestions | C |  |
| 11.12 | Legal, financial or personal data can be changed, checked or confirmed | C | Account deletion asks for the password in a confirmation dialog. |
| 11.13 | The purpose of personal fields can be inferred | C | autocomplete="email", "current-password", "new-password". |
| **12. Navigation** | | | |
| 12.1 | At least two navigation systems | C | Main menu, and a site map linked from every page. |
| 12.2 | Menus stay in the same place | C |  |
| 12.3 | The site map is relevant | C |  |
| 12.4 | The site map is reachable the same way from every page | C | Footer. |
| 12.5 | The search engine is reachable the same way from every page | NA | No site search. |
| 12.6 | Content regions can be reached or skipped | C | header, nav, main and footer landmarks. |
| 12.7 | A skip link leads to the main content | C | "Skip to main content" is the first tab stop. |
| 12.8 | Tab order is coherent | C |  |
| 12.9 | No keyboard trap | C |  |
| 12.10 | Single-key shortcuts can be turned off | NA |  |
| 12.11 | Additional content is keyboard reachable | NA |  |
| **13. Consultation** | | | |
| 13.1 | Time limits can be controlled | NA | Sessions outlast 20 hours, which the standard exempts. |
| 13.2 | No new window opens without user action | NA |  |
| 13.3 | Downloadable documents have an accessible version | NA |  |
| 13.4 | Those versions offer the same information | NA |  |
| 13.5 | Cryptic content has an alternative | NA |  |
| 13.6 | Those alternatives are relevant | NA |  |
| 13.7 | Sudden changes of brightness or flashes are avoided | NA |  |
| 13.8 | Moving or blinking content can be controlled | NA | Only short transitions, and none at all under prefers-reduced-motion. |
| 13.9 | Content works in any orientation | C |  |
| 13.10 | Complex gestures have a simple alternative | C | Dragging a card has a single-tap alternative: the Status select. |
| 13.11 | Pointer actions can be cancelled | C | MUI buttons act on release. |
| 13.12 | Motion-triggered features have an alternative | NA |  |

## Follow-up

1. **Screen reader pass** with NVDA (Windows) and VoiceOver (macOS) on the main journeys: sign up, add a task, move it on the board, delete the account. That is the last step before criterion 7.1, and the application, can be declared compliant.
2. Keep this grid, the CI test and the statement in sync: the figures in [`AccessibilityPage.tsx`](../src/client/pages/AccessibilityPage.tsx) come from this grid.
