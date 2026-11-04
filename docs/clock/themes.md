# Clock themes and visual editors

Themes are shared Firebase view state. Local editor drafts obey the
[save and command-origin contract](../session-mutation-boundary.md).

Code paths in backticks are relative to `clock/src/` unless qualified. Update
this reference when changing the behavior it describes; see the
[task index](../README.md).

## Theme system (CSS Custom Properties)

The display is styled via **CSS Custom Properties** (CSS variables) applied on the `.App` container element. Themes are stored in Firebase as part of `ViewState` and synced like all other state.

### How It Works

1. `ViewState` has optional `theme?: ThemeConfig` (custom overrides), `themePreset?: string`, and `customPresets?: Record<string, CustomPreset>` fields
2. `useThemeCssVars()` hook in `App.tsx` resolves preset + overrides → CSS variable object, checking custom presets first then built-in
3. CSS variables are spread onto the `.App` container's `style` attribute alongside existing inline styles
4. All display CSS uses `var(--theme-*, fallback)` syntax so the display works with or without theme data

**Resolution order**: Look up preset by name/ID (custom presets first, then built-in) → apply `theme` overrides (shallow merge). If no preset is set, `DEFAULT_THEME` is used.

### ThemeConfig Properties

All properties are CSS value strings. Grouped by display area:

| Group         | Properties                                                                                                                                                                                                                                     | CSS Variables                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Score boxes   | `scoreBoxBg`, `scoreBoxColor`, `scoreBoxBorder`, `scoreBoxFontSize`, `scoreBoxFontFamily`, `scoreBoxStroke`, `scoreTop`, `scoreHeight`, `scoreWidth`                                                                                           | `--theme-score-*`                                                                                                                  |
| Clock         | `clockBg`, `clockColor`, `clockBorder`, `clockFontSizeMin`, `clockFontSizeMax`, `clockFontFamily`, `clockStroke`, `clockTop`, `clockLeft`, `clockWidth`, `clockHeight`                                                                         | `--theme-clock-*`                                                                                                                  |
| Logos         | `logoTop`, `logoHeight`, `logoWidth`, `homeLogoScale`, `awayLogoScale`                                                                                                                                                                         | `--theme-logo-*`, `--theme-home-logo-scale`, `--theme-away-logo-scale`                                                             |
| Injury time   | `injuryTimeColor`, `injuryTimeFontSize`, `injuryTimeStroke`, `injuryTimeTop`, `injuryTimeLeft`                                                                                                                                                 | `--theme-injury-*`                                                                                                                 |
| Team names    | `teamNameColor`, `teamNameFontFamily`                                                                                                                                                                                                          | `--theme-team-name-*`                                                                                                              |
| Player assets | `playerNumberColor`, `playerNameColor`, `playerNumberFontFamily`, `playerNameFontFamily`                                                                                                                                                       | `--theme-player-number-color`, `--theme-player-name-color`, `--theme-player-number-font-family`, `--theme-player-name-font-family` |
| Red cards     | `redCardColor`                                                                                                                                                                                                                                 | `--theme-red-card-color`                                                                                                           |
| Penalties     | `penaltyBg`, `penaltyColor`, `penaltyBorder`                                                                                                                                                                                                   | `--theme-penalty-*`                                                                                                                |
| Timeouts      | `timeoutColor`                                                                                                                                                                                                                                 | `--theme-timeout-color`                                                                                                            |
| Ad image      | `adTop`, `adLeft`, `adWidth`, `adHeight`                                                                                                                                                                                                       | `--theme-ad-*`                                                                                                                     |
| Background    | `backgroundImage`                                                                                                                                                                                                                              | `--theme-background-image` (conditional)                                                                                           |
| Idle screen   | `idleTextColor`, `idleTextFontSize`, `idleLogoTop`, `idleLogoLeft`, `idleLogoWidth`, `idleTextTop`, `idleLogoHeight`, `idleClockTop`, `idleClockLeft`, `idleTempTop`, `idleTempLeft`, `idleAdTop`, `idleAdLeft`, `idleAdWidth`, `idleAdHeight` | `--theme-idle-*`                                                                                                                   |

### Preset Themes

**Built-in presets** are defined in `constants.ts` as `THEME_PRESETS`. Their names are tracked in `BUILT_IN_PRESET_NAMES`:

- **Default** — Black boxes, white text, white borders (the original hardcoded look)
- **Vikes Dark** — Dark red boxes with Víkingur red borders
- **Vikes Light** — White semi-transparent boxes with dark text and red borders
- **Minimal** — Transparent backgrounds, no borders, larger score font
- **Blue Ice** — Dark blue boxes with ice-blue text and borders

**Custom presets** are stored per-`listenPrefix` in Firebase at `states/${listenPrefix}/view/customPresets`. Each custom preset has:

- `name: string` — Display name
- `theme: ThemeConfig` — Full theme configuration
- `basedOn?: string` — Name of the built-in preset this was derived from (for modified copies)

### Custom Preset Behavior

- **A preset is always active** — there is no "no preset" state
- **Editing a built-in preset** auto-creates an independent copy named `"<preset> (breytt)"`. The built-in preset remains untouched and the copy has no link back to it
- **Editing a custom preset** updates it directly (no copy behavior)
- **Creating a new preset** creates a blank custom preset with `DEFAULT_THEME` values
- **Deleting** a custom preset removes it from Firebase; if it was active, falls back to Default
- **Renaming** custom presets uses the pencil button. Completion belongs to
  the submitting edit instance, draft revision, submission, modal lifetime,
  and session scope. Late success/failure cannot close or change feedback on
  a newer, reopened, or same-ID revised draft. Enter followed by blur submits
  once, including a blur after reopening. A matching rejected save keeps its
  draft/error and permits an explicit Enter retry.

### Key Files

| File                                         | Role                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `types.ts`                                   | `ThemeConfig` and `CustomPreset` interface definitions                                                                                                        |
| `constants.ts`                               | `DEFAULT_THEME`, `THEME_PRESETS`, and `BUILT_IN_PRESET_NAMES`                                                                                                 |
| `hooks/useThemeCssVars.ts`                   | `useThemeCssVars()` hook (config → CSS vars), `resolveTheme()`, and `lookupPreset()` (custom → built-in fallback)                                             |
| `contexts/firebaseParsers.ts`                | `parseTheme()`, `parseCustomPresets()` validators for Firebase data                                                                                           |
| `contexts/FirebaseStateContext.tsx`          | `setTheme()`, `setThemePreset()`, `saveCustomPreset()`, `deleteCustomPreset()` actions                                                                        |
| `App.tsx`                                    | Applies CSS vars to `.App` container (passes `customPresets` to `useThemeCssVars`)                                                                            |
| `controller/theme/ThemeEditor.tsx`           | `ThemeEditorModal` — rsuite Modal for preset management and theme editing                                                                                     |
| `controller/theme/ThemeEditor.css`           | Theme editor modal styling                                                                                                                                    |
| `controller/theme/VisualEditorCore.tsx`      | Shared visual editor components: `ElementDef`, `ColorPopover`, `DraggableElement`, `PopoverState`, `OnColorClickFn`. Used by both scoreboard and idle editors |
| `controller/theme/VisualThemeEditor.tsx`     | Scoreboard visual editor — element definitions, background upload, uses shared components from `VisualEditorCore`                                             |
| `controller/theme/IdleVisualThemeEditor.tsx` | Idle screen visual editor — element definitions, simplified popover (text color only), uses shared components from `VisualEditorCore`                         |
| `controller/theme/VisualThemeEditor.css`     | Visual editor styles (upload indicator, clear button, popover controls)                                                                                       |
| `screens/ScoreBoard.css`                     | Uses `var(--theme-*)` for score/clock/penalty display                                                                                                         |
| `screens/Idle.css`                           | Uses `var(--theme-*)` for idle screen display                                                                                                                 |
| `match/RedCard.css`                          | Uses `var(--theme-red-card-color)`                                                                                                                            |
| `match/ClockBase.tsx`                        | Uses CSS var expressions for font size (with prop defaults as fallbacks)                                                                                      |

### Adding a New Theme Property

1. Add the property to `ThemeConfig` in `types.ts`
2. Add default value in `DEFAULT_THEME` in `constants.ts`
3. Add CSS variable mapping in `themeToCssVars()` in `useThemeCssVars.ts`
4. Use `var(--theme-your-var, fallback)` in the relevant CSS file
5. Optionally add it to preset themes and the `ThemeEditor` UI

New `ThemeConfig` keys are picked up automatically: every preset spreads
`DEFAULT_THEME`, and `parseTheme()` in `firebaseParsers.ts` iterates
`DEFAULT_THEME` keys (falling back to the default for absent Firebase
values). This is how `playerNumberColor`/`playerNameColor` and
`playerNumberFontFamily`/`playerNameFontFamily` were added — they control
the color and font family of the player number/name assets (`Asset.css`,
auto-fit measurement in `PlayerCard.tsx`).

### Background Image

Each theme can have a custom `backgroundImage` URL that overrides the default background. This is a **per-theme** property stored in `ThemeConfig`, so different presets can have different backgrounds.

**Upload flow** (Visual tab in ThemeEditor):

1. User clicks the canvas background area in `VisualThemeEditor`
2. A hidden `<input type="file">` opens for image selection
3. Image uploads to Firebase Storage at `${listenPrefix}/backgrounds/bg-${Date.now()}.${ext}`
4. On success, the download URL is saved as `theme.backgroundImage` via `onChange`
5. A "✕" button appears to clear the background

**Display** (`App.tsx`):

- When `effectiveTheme.backgroundImage` is set and the display is not blacked out, it overrides `getBackground()` with `backgroundImage: url(...)`, `backgroundSize: cover`, `backgroundPosition: center`
- The `--theme-background-image` CSS var is only emitted when the URL is non-empty

**Advanced tab** (`ThemeEditor.tsx`):

- "Bakgrunnsmynd" panel with a URL text input and "Fjarlægja mynd" clear button

### Ad Image Positioning

The ad image (`img.ad` in `ScoreBoard.css`) uses theme CSS vars for all positioning:

- `adTop` (default `"73%"`), `adLeft` (default `"33.5%"`), `adWidth` (default `"33%"`), `adHeight` (default `"25%"`)
- In the Visual tab, the "AD" element is draggable like other elements (score boxes, clock, etc.)
- The Advanced tab has an "Auglýsing" panel with position/size percentage inputs

**Note**: The original CSS used `bottom: 2%` with `height: 25%`, which was converted to the equivalent `top: 73%` for consistency with the theme system's top-based positioning.

### Per-Team Logo Scaling

Each team's logo can be independently scaled via `homeLogoScale` and `awayLogoScale` (percentage strings, e.g. `"100%"`). The advanced theme dialog exposes these as separate `Stærð heimamerkis` and `Stærð útimerkis` fields below the shared logo position and bounds. The scaling uses CSS `transform: scale()` with `transform-origin: top center` on `.img-wrapper`, so the configured `logoTop` remains the visible upper edge while the logo grows or shrinks downward. The `themeToCssVars()` function converts the percentage to a unitless scale factor (e.g. `"100%"` → `"1"`, `"150%"` → `"1.5"`). Because `transform: scale()` is used (not width/height changes), aspect ratio is always preserved.

The bundled Keflavík crest has a team-specific `70%` image width in `ScoreBoard.css` because its artwork otherwise appears oversized relative to the other crests.

### Viewport Variants Note

The `insidebig` and `insidesmall` CSS viewport variants (for indoor screens) still use hardcoded position overrides. Theme CSS vars apply to the default/outdoor layout. Converting indoor variants to use theme vars is a potential future enhancement.

### Idle Text Outline

`idleTextStroke` is an opt-in CSS text stroke shared by the idle clock and
temperature (`--theme-idle-text-stroke`). It defaults to `"none"`, including
when parsing existing presets without the field, so existing themes retain
their appearance. Edit it through **Ítarlegt → Idle skjár → Leturútlína**.
The idle visual editor still exposes color and size only.

### Idle Screen Visual Editor

`IdleVisualThemeEditor.tsx` provides a drag-and-drop visual editor for positioning idle screen elements, following the same pattern as `VisualThemeEditor.tsx` (scoreboard editor).

**Four draggable elements**:

- **idle-logo**: Club logo — controls `idleLogoHeight` (resizable height)
- **idle-clock**: Clock display — controls `idleClockTop`, `idleClockLeft` (position), `idleTextFontSize`, `idleTextColor` (appearance)
- **idle-temp**: Temperature display — controls `idleTempTop`, `idleTempLeft` (position)
- **idle-ad**: Selected sponsor ad — controls `idleAdTop`, `idleAdLeft`, `idleAdWidth`, `idleAdHeight` (position + size)

**Differences from scoreboard visual editor**:

- No background image upload (idle screen background is controlled separately)
- Font size slider uses `px` units (range 10–120) vs scoreboard's `rem` units
- Simplified `ColorPopover` (no stroke field)

**Idle screen layout** (`Idle.tsx` / `Idle.css`):

- Clock and temperature are individually absolutely-positioned elements (not wrapped in a shared container)
- Each uses CSS vars: `--theme-idle-clock-top`, `--theme-idle-clock-left`, `--theme-idle-temp-top`, `--theme-idle-temp-left`
- The selected idle ad uses `--theme-idle-ad-top`, `--theme-idle-ad-left`, `--theme-idle-ad-width`, `--theme-idle-ad-height`
- The idle logo uses `--theme-idle-logo-height` for resizable height

### ThemeEditor UI

The theme editor is a **full rsuite Modal** (`ThemeEditorModal`) launched from a "Klukku þema" / "Breyta" trigger row in the Controller settings. It does NOT expand inline — the Settings modal stays simple.

**Layout**:

- **Left section**: Preset list (built-in presets as `ButtonGroup`, custom presets as a list below with rename/delete controls)
- **Right section**: Three tabs — "Sjónrænt" (visual scoreboard editor), "Sjónrænt (idle)" (visual idle screen editor), and "Ítarlegt" (advanced property panels)

**Preset management features**:

- Select any built-in or custom preset to activate it
- Editing a built-in preset auto-creates an independent copy named `"<preset> (breytt)"` — original stays untouched
- "Nýtt þema" button creates a blank custom preset from `DEFAULT_THEME`
- Custom preset names are editable via pencil (edit) icon button next to delete
- Custom presets can be deleted via `IconButton` with `TrashIcon`

**Editor panels** (extracted into `ThemeEditorPanels` sub-component):

- Color pickers, text inputs, font family selectors, percentage inputs
- Collapsible panels for each property group (Score boxes, Clock, Logos, etc.)
- "Idle skjár" panel includes an `IdleAdPicker` dropdown for selecting the idle ad image from Firebase Storage

**Controller integration** (`Controller.tsx`):

- `themeOpen` boolean state controls modal visibility
- Trigger row shows current preset name + "Breyta" button
- `<ThemeEditorModal open={themeOpen} onClose={...} />`

All labels are in Icelandic, consistent with the rest of the controller UI.

### Fonts

**Google Fonts** (loaded via CDN in `index.html`): Anton, Oswald, Bebas Neue, Orbitron, Russo One.

**Bundled fonts** (self-hosted via `@font-face` in `src/assets/fonts/`):

- **GT America** (Grilli Type) — Regular + Bold weights (`GT-America-Standard-Regular.otf`, `GT-America-Standard-Bold.otf`). Declared in `src/assets/fonts/gt-america.css`, imported in `src/index.tsx`.

The exported `FONT_OPTIONS` array in `ThemeEditor.tsx` defines the available fonts in the per-element font dropdowns in both the advanced ThemeEditor and the visual VisualThemeEditor (score box, clock, team name). To add a new font:

1. For Google Fonts: add the `<link>` to `index.html` and add the CSS `font-family` string to `FONT_OPTIONS`
2. For bundled fonts: place files in `src/assets/fonts/`, create a CSS file with `@font-face` declarations (use `format("opentype")` for `.otf`), import the CSS in `src/index.tsx`, and add to `FONT_OPTIONS`
