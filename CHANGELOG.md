# Changelog

## 2.1.1 - 2026-06-11

### Changed

- Default start date (`startDate`) is now initialized to the 1st of the current month instead of 7 days ago (`getDefaultStartDate`).
- Filter reset button ("Сбросить фильтры") now applies the current month preset (`applyThisMonthPreset`) instead of the 7-day preset, completely resetting the dashboard and lists to the beginning of the month.
- Optimized and improved the responsive interface rendering and Russian localization rules.

## 2.0.0 - 2026-06-08

### Added

- 24-hour `from` / `to` time filtering for call lists and dashboard statistics.
- Russian date picker with Monday-first calendar layout.
- HMAC-signed authentication tokens to prevent client-side role tampering.

### Changed

- Bumped application version from `1.0.0` to `2.0.0`.
- Date filtering now uses local date values instead of UTC-derived ISO date strings in the UI.
- Restored normal multi-line source formatting after resolving the GitHub merge conflict.


### Security

- Removed shell-based recording lookup and replaced it with safe in-process path resolution constrained to the recordings root.
