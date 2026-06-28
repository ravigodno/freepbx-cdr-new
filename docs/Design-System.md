# PBXPuls Design System

## Purpose

The PBXPuls Design System defines the common visual language for all current and future modules. New UI must reuse shared primitives instead of copying Tailwind class strings into every screen.

The first shared implementation exists in src/components/ui/DesignSystem.tsx.

## Core Principles

- Administrative interface first: dense, predictable, readable.
- No marketing-style landing pages inside operational tools.
- Same actions must look the same across modules.
- Dangerous actions must be visually distinct.
- Future modules must use the same buttons, cards, tables, badges, headers and toolbars.

## Colors

Primary action color:

- bg-blue-600
- hover:bg-blue-700
- white text

Primary is used for:

- Preview
- Apply
- Save
- Create
- Update
- Reload
- Refresh
- Continue

Neutral UI colors:

- slate borders and backgrounds for secondary controls, cards, tables and empty states.
- blue only for primary actions, active states and informational emphasis.

Danger color:

- rose/red only for destructive actions and error states.
- Do not use red for neutral emphasis.

Status colors:

- success: emerald/green
- warning: amber/yellow
- error: rose/red
- info: blue
- neutral: slate/gray

## Buttons

Use shared components where possible:

- PrimaryButton
- SecondaryButton
- DangerButton
- IconButton
- OperationToolbar

Rules:

- PrimaryButton always uses bg-blue-600.
- SecondaryButton uses neutral border/background.
- DangerButton is reserved for Delete, Remove, Reset Configuration and other destructive operations.
- Buttons should use lucide-react icons when an icon exists.
- Text, height, radius and padding should remain consistent: h-9, rounded-lg, text-xs, compact padding.

## Cards and Sections

Use Card for individual framed blocks, repeated items, modals or operation panels.

Use Section for vertical grouping and spacing.

Rules:

- Default card radius: rounded-lg.
- Default card border: slate border.
- Avoid cards inside cards unless there is a real nested object such as a modal or repeated item.
- Page sections should not become decorative floating cards.

## Inputs, Selects and Textareas

Form controls should have consistent:

- height;
- text size;
- border radius;
- padding;
- focus border color;
- disabled state.

Current Provisioning Center still has local input class strings. Future refactoring should move Input, Select and Textarea into src/components/ui.

## Tables

Tables should support:

- sticky header where useful;
- hover rows;
- compact text;
- clear status/action badges;
- horizontal scrolling for wide operational data;
- stable columns for repeated operation previews.

Preview tables must use a common structure:

- Object
- Action
- Status
- Old
- New
- Message

The shared PreviewTable component already follows this structure.

## Badges

Use StatusBadge for common statuses.

Badge rules:

- uppercase text for operation/status labels;
- small compact size;
- ring/border for low visual noise;
- semantic colors only.

Recommended operation statuses:

- SUCCESS
- WARNING
- ERROR
- SKIP
- CONFLICT

Recommended operation action groups:

- Create
- Update
- Delete
- Skip
- Conflict
- Error

## Toolbar

Use Toolbar for groups of actions. Toolbars should:

- wrap on small screens;
- keep consistent gap;
- place Preview, Apply and Reset in the same order for operation screens.

Use OperationToolbar for Preview → Apply → Reset flows.

## Page Header

Use PageHeader for section titles. It supports:

- optional lucide icon;
- title;
- description;
- optional actions.

The icon should identify the section, not duplicate another nearby navigation item.

## Summary Cards

Use OperationSummary for preview/result counts.

Current summary card categories:

- Create
- Update
- Delete
- Skip
- Conflict
- Error

Rules:

- same size;
- same layout;
- same status colors;
- no per-operation custom summary card designs.

## Preview Table

Use PreviewTable for all provisioning operation previews. Future modules must not create separate preview table shapes unless the shared component is extended.

Preview may show normalized UI values, but apply payloads must contain only backend-supported fields. Example: Extensions may display normalized Recording, while apply sends only recording_in_external, recording_out_external, recording_in_internal, recording_out_internal, recording_ondemand and recording_priority.

## Icons

PBXPuls uses lucide-react as the single icon set.

Navigation icon rules:

- Management / Управление: Wrench.
- Settings / Настройки: Settings.
- Avoid placing visually similar icons next to each other.
- Each main section should have a distinct icon.
- Do not introduce another icon library without a project-wide decision.

## Current Shared UI Components

Implemented in src/components/ui/DesignSystem.tsx:

- PrimaryButton
- SecondaryButton
- DangerButton
- IconButton
- Card
- Section
- Toolbar
- PageHeader
- InfoCard
- StatusBadge
- OperationToolbar
- OperationSummary
- PreviewTable

## TODO

- Move common Input, Select and Textarea primitives into DesignSystem.
- Replace remaining local button/card/table class strings in legacy screens.
- Convert Trunks, Routes and DID screens to shared OperationToolbar, OperationSummary and PreviewTable before expanding them.


## Compact Module Header

Large PBXPuls modules use a compact single-line header:

- module icon;
- module title;
- horizontal section tabs in the same row.

The header must not add a second subtitle row. Tabs stay on one line and use horizontal scrolling when needed. The active tab uses bg-blue-600 with white text; inactive tabs use the neutral Design System button style.

Module layout standard:

1. Header: icon, module name, section tabs.
2. Toolbar: primary module actions.
3. Filters: search, filters and sorting.
4. Workspace: tables, forms, cards and operational panels.
5. Operation Flow: Preview, Apply, Result for mutating operations.

Russian UI text must come from src/locales/ru.ts. Technical terms such as Extension, Trunk, Outbound Route, API, BMO, FreePBX, AMI and ARI remain untranslated.
