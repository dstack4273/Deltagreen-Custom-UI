// color-theme-manager.js
// Per-player CRT color customization via CSS variables

export class ColorThemeManager {
  static MODULE_ID = "deltagreen-custom-ui";

  /* ---------------------------------------------------------------------- */
  /* SETTINGS                                                               */
  /* ---------------------------------------------------------------------- */

  static registerSettings() {
    // Toggle: use custom colors at all
    game.settings.register(this.MODULE_ID, "useCustomColors", {
      name: "Use Custom CRT Colors",
      hint: "If enabled, your personal color choices override the base theme.",
      scope: "client",
      config: true,
      type: Boolean,
      default: false,
      onChange: () => this.reapplyCurrentTheme()
    });

    // Base background
    game.settings.register(this.MODULE_ID, "customBg", {
      name: "CRT Background Color",
      hint: "Main screen background color (e.g. #000000).",
      scope: "client",
      config: true,
      type: String,
      default: "#000000",
      onChange: () => this.reapplyCurrentTheme()
    });

    // Primary text / glow
    game.settings.register(this.MODULE_ID, "customPrimary", {
      name: "Primary Text / Glow Color",
      hint: "Main text / neon color (e.g. #ffb000 for amber).",
      scope: "client",
      config: true,
      type: String,
      default: "#ffb000",
      onChange: () => this.reapplyCurrentTheme()
    });

    // Secondary / dim text
    game.settings.register(this.MODULE_ID, "customSecondary", {
      name: "Secondary Text Color",
      hint: "Dimmer text / borders.",
      scope: "client",
      config: true,
      type: String,
      default: "#997a33",
      onChange: () => this.reapplyCurrentTheme()
    });

    // Accent (borders, highlights)
    game.settings.register(this.MODULE_ID, "customAccent", {
      name: "Accent Color",
      hint: "Borders, highlights, selection outlines.",
      scope: "client",
      config: true,
      type: String,
      default: "#ffdd66",
      onChange: () => this.reapplyCurrentTheme()
    });

    // Danger (errors, SAN bad, HP critical, etc.)
    game.settings.register(this.MODULE_ID, "customDanger", {
      name: "Danger / Warning Color",
      hint: "Used for errors, critical states, etc.",
      scope: "client",
      config: true,
      type: String,
      default: "#ff3333",
      onChange: () => this.reapplyCurrentTheme()
    });
  }

  /* ---------------------------------------------------------------------- */
  /* APPLYING / REAPPLYING THEME                                            */
  /* ---------------------------------------------------------------------- */

  // Called from DeltaGreenUI.applyTheme(theme)
  static applyTheme(theme) {
    const key = theme || "amber";

    // 1) Start from a base palette per theme
    const base = this._getBasePalette(key);

    // 2) Apply base palette as CSS vars
    this._applyPalette(base);

    // 3) If user toggled "Use Custom CRT Colors", overlay their choices
    const useCustom = game.settings.get(this.MODULE_ID, "useCustomColors");
    if (!useCustom) return;

    const custom = {
      bg:        game.settings.get(this.MODULE_ID, "customBg")        || base.bg,
      primary:   game.settings.get(this.MODULE_ID, "customPrimary")   || base.primary,
      secondary: game.settings.get(this.MODULE_ID, "customSecondary") || base.secondary,
      accent:    game.settings.get(this.MODULE_ID, "customAccent")    || base.accent,
      danger:    game.settings.get(this.MODULE_ID, "customDanger")    || base.danger
    };

    this._applyPalette(custom);
  }

  // Utility used by settings onChange to re-apply current theme
  static reapplyCurrentTheme() {
    try {
      const theme = game.settings.get(this.MODULE_ID, "theme") || "amber";
      this.applyTheme(theme);
    } catch (e) {
      console.error("Delta Green UI | ColorThemeManager.reapplyCurrentTheme error:", e);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* INTERNAL: PALETTE + CSS VARS                                           */
  /* ---------------------------------------------------------------------- */

  static _getBasePalette(theme) {
    switch (theme) {
      case "green":
        return {
          bg:        "#000000",
          primary:   "#44ff77",
          secondary: "#2f6a3f",
          accent:    "#66ff99",
          danger:    "#ff4444"
        };

      case "blue":
        return {
          bg:        "#020611",
          primary:   "#66ccff",
          secondary: "#335577",
          accent:    "#99ddff",
          danger:    "#ff6666"
        };

      case "purple":
        return {
          bg:        "#090111",
          primary:   "#d28cff",
          secondary: "#6b4a99",
          accent:    "#f0b3ff",
          danger:    "#ff5577"
        };

      case "red":
        return {
          bg:        "#080000",
          primary:   "#ff5555",
          secondary: "#aa2222",
          accent:    "#ff8888",
          danger:    "#ff4444"
        };

      case "white":
        return {
          bg:        "#000000",
          primary:   "#f5f5f5",
          secondary: "#aaaaaa",
          accent:    "#ffffff",
          danger:    "#ff4444"
        };

      // default: amber
      case "amber":
      default:
        return {
          bg:        "#000000",
          primary:   "#ffb000",
          secondary: "#aa7a22",
          accent:    "#ffd766",
          danger:    "#ff4444"
        };
    }
  }

  static _applyPalette(p) {
    const root = document.documentElement;

    // These are the CSS variables you'll target in your CSS.
    root.style.setProperty("--dg-color-bg",         p.bg);
    root.style.setProperty("--dg-color-primary",    p.primary);
    root.style.setProperty("--dg-color-secondary",  p.secondary);
    root.style.setProperty("--dg-color-accent",     p.accent);
    root.style.setProperty("--dg-color-danger",     p.danger);

    // Optional convenience aliases; map them to what your CSS already uses
    root.style.setProperty("--crt-bg",              p.bg);
    root.style.setProperty("--crt-primary",         p.primary);
    root.style.setProperty("--crt-dark-primary",    p.secondary);
    root.style.setProperty("--crt-text",            p.primary);
    root.style.setProperty("--crt-highlight",       p.accent);
    root.style.setProperty("--crt-shadow",          "rgba(0,0,0,0.4)");

    root.style.setProperty("--dg-color-border",     p.accent);
    root.style.setProperty("--dg-color-text",       p.primary);
    root.style.setProperty("--dg-color-text-dim",   p.secondary);
  }
}
