// time-manager.js

export class TimeManager {
  static ID = "deltagreen-custom-ui";
  static SETTINGS_KEY = "timeState";

  // Default starting state – tweak to your favorite default night
  static defaultState() {
    // 1989-07-02 21:15 local time (arbitrary default)
    const base = new Date(1989, 6, 2, 21, 15, 0, 0);
    return {
      label: "OPERATION",
      inWorldEpoch: base.getTime(),  // ms since epoch
      anchorRealEpoch: null,        // real-world ms when clock started
      running: false,
      note: "",
      weather: "",                  // NEW: free-text weather string
      // shared operation log
      // [{ date, time, agent, text, createdBy, createdAt }]
      log: []
    };
  }

  /* ---------------------------------------------------------------------- */
  /* INIT                                                                   */
  /* ---------------------------------------------------------------------- */

  static init() {
    // World-level storage for the operation clock
    game.settings.register(this.ID, this.SETTINGS_KEY, {
      name: "Delta Green UI - Time State",
      scope: "world",
      config: false,
      type: Object,
      default: this.defaultState()
    });

    // When the DG UI DOM is ready, wire everything
    Hooks.on("renderDeltaGreenUI", () => {
      this.refresh();
      this._bindEvents();
      this._startTicker();
    });
  }

  /* ---------------------------------------------------------------------- */
  /* STATE HELPERS                                                          */
  /* ---------------------------------------------------------------------- */

  static getState() {
    try {
      let raw = game.settings.get(this.ID, this.SETTINGS_KEY) || {};

      // Backwards compatibility: convert from old {date,time,operationLabel}
      if (raw.inWorldEpoch == null) {
        const date = raw.date || "1989-07-02";
        const time = raw.time || "21:15";
        const base = this._parseDateTime(date, time);
        raw.inWorldEpoch = base.getTime();
      }

      if (!raw.label && raw.operationLabel) {
        raw.label = raw.operationLabel;
      }

      // Normalize fields
      const defaults = this.defaultState();
      return {
        label: raw.label ?? defaults.label,
        inWorldEpoch:
          Number(raw.inWorldEpoch) || defaults.inWorldEpoch,
        anchorRealEpoch:
          raw.anchorRealEpoch != null
            ? Number(raw.anchorRealEpoch)
            : null,
        running: !!raw.running,
        note: raw.note ?? "",
        weather: raw.weather ?? defaults.weather,      // NEW
        log: Array.isArray(raw.log) ? raw.log : []
      };
    } catch (err) {
      console.error("DG TimeManager | getState error", err);
      return this.defaultState();
    }
  }

  static async saveState(partial) {
    try {
      const current = this.getState();
      const merged = foundry.utils.mergeObject(
        current,
        partial,
        { inplace: false, overwrite: true }
      );
      await game.settings.set(this.ID, this.SETTINGS_KEY, merged);
      this.refresh();
    } catch (err) {
      console.error("DG TimeManager | saveState error", err);
      ui.notifications?.error?.("Error saving DG time state.");
    }
  }

  static async resetToDefault() {
    if (!game.user.isGM) return;
    await game.settings.set(this.ID, this.SETTINGS_KEY, this.defaultState());
    this.refresh();
  }

  /* ---------------------------------------------------------------------- */
  /* CURRENT IN-WORLD TIME                                                  */
  /* ---------------------------------------------------------------------- */

  // Returns a Date that represents the *current* in-world time, accounting
  // for whether the clock is running or paused.
  static getCurrentWorldDate(state = null) {
    state = state || this.getState();

    const baseEpoch =
      Number(state.inWorldEpoch) || this.defaultState().inWorldEpoch;

    if (!state.running || !state.anchorRealEpoch) {
      return new Date(baseEpoch);
    }

    const realDelta = Date.now() - Number(state.anchorRealEpoch);
    return new Date(baseEpoch + realDelta);
  }

  /* ---------------------------------------------------------------------- */
  /* RENDER                                                                 */
  /* ---------------------------------------------------------------------- */

  static refresh() {
    const root = document.getElementById("dg-view-time");
    if (!root) return;

    const state = this.getState();
    this._updateDisplay(root, state, { updateInputs: true });
  }

  static _updateDisplay(root, state, { updateInputs = false } = {}) {
    const nowWorld = this.getCurrentWorldDate(state);
    const { dateStr, timeStr, segment } = this._formatForDisplay(nowWorld);

    const setText = (sel, value) => {
      const el = root.querySelector(sel);
      if (el) el.textContent = value ?? "";
    };

    setText("#dg-time-display-op", state.label || "OPERATION");
    setText("#dg-time-display-date", dateStr);
    setText("#dg-time-display-time", timeStr);
    setText("#dg-time-display-segment", segment);
    setText("#dg-time-display-weather", state.weather || "—"); // NEW

    // Notes textarea is editable for GM but "live" for players too
    const noteEl = root.querySelector("#dg-time-notes");
    if (noteEl && !updateInputs) {
      // on tick, don't touch note; only refresh() does note sync
    } else if (noteEl && updateInputs) {
      if (noteEl.value !== (state.note || "")) {
        noteEl.value = state.note || "";
      }
    }

    // Render operation log table
    this._renderLog(root, state);

    // GM-only inputs
    const isGM = game.user.isGM;

    root
      .querySelectorAll(".dg-time-gm-only")
      .forEach((el) => {
        el.style.display = isGM ? "" : "none";
      });

    if (updateInputs && isGM) {
      const setValue = (sel, value) => {
        const el = root.querySelector(sel);
        if (!el) return;
        // Don't stomp while GM is actively typing
        if (document.activeElement === el) return;
        el.value = value ?? "";
      };

      setValue("#dg-time-input-op", state.label || "");
      setValue("#dg-time-input-date", dateStr);
      setValue("#dg-time-input-time", timeStr);
      setValue("#dg-time-input-segment", segment);
      setValue("#dg-time-input-weather", state.weather || ""); // NEW

      const toggleBtn = root.querySelector("#dg-time-toggle-run");
      if (toggleBtn) {
        toggleBtn.textContent = state.running
          ? "PAUSE CLOCK"
          : "START CLOCK";
      }
    }
  }

  static _renderLog(root, state) {
    const tbody = root.querySelector("#dg-time-log-body");
    if (!tbody) return;

    const log = Array.isArray(state.log) ? state.log : [];
    tbody.innerHTML = "";

    log.forEach((entry, idx) => {
      const tr = document.createElement("tr");
      tr.className = "dg-time-log-row";
      tr.dataset.index = String(idx);

      const whenCell = document.createElement("td");
      whenCell.className = "dg-time-log-cell dg-time-log-cell-time";
      const datePart = entry.date || "";
      const timePart = entry.time || "";
      whenCell.textContent = `${datePart} ${timePart}`.trim() || "—";

      const agentCell = document.createElement("td");
      agentCell.className = "dg-time-log-cell dg-time-log-cell-agent";
      agentCell.textContent = entry.agent || entry.createdBy || "—";

      const textCell = document.createElement("td");
      textCell.className = "dg-time-log-cell dg-time-log-cell-text";
      textCell.textContent = entry.text || entry.note || "";

      tr.appendChild(whenCell);
      tr.appendChild(agentCell);
      tr.appendChild(textCell);

      tbody.appendChild(tr);
    });
  }

  /* ---------------------------------------------------------------------- */
  /* DOM BINDINGS                                                           */
  /* ---------------------------------------------------------------------- */

  static _bindEvents() {
    const root = document.getElementById("dg-view-time");
    if (!root) return;

    // Avoid double-binding
    if (root.dataset.dgTimeBound === "1") return;
    root.dataset.dgTimeBound = "1";

    const form = root.querySelector("#dg-time-form");
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        this._updateFromInputs(root);
      });

      form.addEventListener("change", () => {
        this._updateFromInputs(root);
      });
    }

    // Start/Pause real-time clock
    const toggleBtn = root.querySelector("#dg-time-toggle-run");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.toggleRunning();
      });
    }

    // Advance time buttons (+5, +15, etc.)
    root
      .querySelectorAll("[data-dg-time-advance]")
      .forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const minutes = Number(btn.dataset.dgTimeAdvance || 0);
          if (!minutes) return;
          this.advanceMinutes(minutes);
        });
      });

    // Reset button
    const resetBtn = root.querySelector("#dg-time-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this.resetToDefault();
      });
    }

    // Add log entry button (players & GM)
    const addLogBtn = root.querySelector("#dg-time-log-add");
    if (addLogBtn) {
      addLogBtn.addEventListener("click", (ev) => {
        ev.preventDefault();
        this._promptAddLogEntry();
      });
    }

    // Click a log row to delete (GM only, left-click)
    const logBody = root.querySelector("#dg-time-log-body");
    if (logBody) {
      logBody.addEventListener("click", (ev) => {
        const row = ev.target.closest(".dg-time-log-row");
        if (!row) return;
        if (!game.user.isGM) return;

        const idx = Number(row.dataset.index ?? -1);
        if (Number.isNaN(idx) || idx < 0) return;

        const state = this.getState();
        const log = Array.isArray(state.log) ? state.log : [];
        const entry = log[idx];
        const label =
          (entry?.agent ? `${entry.agent} – ` : "") +
          (entry?.text || "");

        new Dialog({
          title: "Delete Log Entry",
          content: `<p>Delete this entry?</p><p><em>${foundry.utils.escapeHTML(
            label.slice(0, 120)
          )}</em></p>`,
          buttons: {
            ok: {
              label: "Delete",
              icon: '<i class="fas fa-trash"></i>',
              callback: () => this._deleteLogEntry(idx)
            },
            cancel: { label: "Cancel" }
          },
          default: "cancel"
        }, {
		classes: ["dg-ui-dialog", "dg-time-log-dialog"]}).render(true);
      });
    }
  }

  static _updateFromInputs(root) {
    if (!game.user.isGM) return;
    if (!root) root = document.getElementById("dg-view-time");
    if (!root) return;

    const state = this.getState();

    const op = root.querySelector("#dg-time-input-op")?.value?.trim() || "";
    const date = root.querySelector("#dg-time-input-date")?.value?.trim() || "";
    const time = root.querySelector("#dg-time-input-time")?.value?.trim() || "";
    const weather = root.querySelector("#dg-time-input-weather")?.value?.trim() || ""; // NEW
    const note = root.querySelector("#dg-time-notes")?.value || "";

    const baseDate = this._parseDateTime(date, time);

    this.saveState({
      label: op || "OPERATION",
      inWorldEpoch: baseDate.getTime(),
      // If clock is running, re-anchor from "now" so it keeps ticking from this new time
      anchorRealEpoch: state.running ? Date.now() : null,
      running: state.running,
      note,
      weather                             // NEW
    });
  }

  /* ---------------------------------------------------------------------- */
  /* REAL-TIME CLOCK CONTROL                                                */
  /* ---------------------------------------------------------------------- */

  static async toggleRunning() {
    if (!game.user.isGM) return;

    const state = this.getState();
    if (state.running && state.anchorRealEpoch != null) {
      // Pause: freeze current world time into inWorldEpoch
      const nowWorld = this.getCurrentWorldDate(state);
      await this.saveState({
        inWorldEpoch: nowWorld.getTime(),
        anchorRealEpoch: null,
        running: false
      });
    } else {
      // Start: anchor "now" as the new baseline
      const nowWorld = this.getCurrentWorldDate(state);
      await this.saveState({
        inWorldEpoch: nowWorld.getTime(),
        anchorRealEpoch: Date.now(),
        running: true
      });
    }
  }

  static async advanceMinutes(deltaMinutes) {
    if (!game.user.isGM) return;

    const state = this.getState();
    const nowWorld = this.getCurrentWorldDate(state);
    const future = new Date(nowWorld.getTime() + deltaMinutes * 60_000);

    await this.saveState({
      inWorldEpoch: future.getTime(),
      anchorRealEpoch: state.running ? Date.now() : null,
      running: state.running
    });
  }

  /* ---------------------------------------------------------------------- */
  /* TICKER                                                                 */
  /* ---------------------------------------------------------------------- */

  static _startTicker() {
    if (this._tickerInterval) return;

    this._tickerInterval = setInterval(() => {
      const root = document.getElementById("dg-view-time");
      if (!root) return;

      // Only bother if CRT overlay is *on*
      if (!document.body.classList.contains("dg-crt-on")) return;

      const state = this.getState();
      this._updateDisplay(root, state, { updateInputs: false });
    }, 1000);
  }

  static _stopTicker() {
    if (!this._tickerInterval) return;
    clearInterval(this._tickerInterval);
    this._tickerInterval = null;
  }

  /* ---------------------------------------------------------------------- */
  /* LOG HELPERS                                                            */
  /* ---------------------------------------------------------------------- */

  static async _addLogEntry(data) {
    const state = this.getState();
    const log = Array.isArray(state.log) ? [...state.log] : [];

    log.push({
      date: data.date,
      time: data.time,
      agent: data.agent,
      text: data.text,
      createdBy: data.createdBy,
      createdAt: Date.now()
    });

    await this.saveState({ log });
  }

  static async _deleteLogEntry(index) {
    const state = this.getState();
    const log = Array.isArray(state.log) ? [...state.log] : [];

    if (index < 0 || index >= log.length) return;
    log.splice(index, 1);

    await this.saveState({ log });
  }

  static _promptAddLogEntry() {
    const state = this.getState();
    const nowWorld = this.getCurrentWorldDate(state);
    const { dateStr, timeStr } = this._formatForDisplay(nowWorld);

    const defaultAgent = game.user?.name || "AGENT";
    const content = `
      <form class="dg-time-log-form">
        <div class="form-group">
          <label>Date / Time</label>
          <div style="display:flex; gap:4px;">
            <input type="text" name="dg-log-date" value="${dateStr}" style="flex:0 0 90px;" />
            <input type="text" name="dg-log-time" value="${timeStr}" style="flex:0 0 70px;" />
          </div>
        </div>
        <div class="form-group">
          <label>Agent</label>
          <input type="text" name="dg-log-agent" value="${foundry.utils.escapeHTML(
            defaultAgent
          )}" />
        </div>
        <div class="form-group">
          <label>Event / Note</label>
          <textarea name="dg-log-text" rows="3"
            placeholder="What just happened? Breach, gunshots, injuries, countdown, etc."></textarea>
        </div>
      </form>
    `;

    new Dialog({
      title: "Add Operation Log Entry",
      content,
      buttons: {
        add: {
          label: "Add",
          icon: '<i class="fas fa-plus"></i>',
          callback: (html) => {
            const $html = $(html);
            const date = ($html.find("[name='dg-log-date']").val() || "").toString().trim();
            const time = ($html.find("[name='dg-log-time']").val() || "").toString().trim();
            const agent = ($html.find("[name='dg-log-agent']").val() || "").toString().trim();
            const text = ($html.find("[name='dg-log-text']").val() || "").toString().trim();

            if (!text) return;

            this._addLogEntry({
              date,
              time,
              agent,
              text,
              createdBy: game.user?.name || "Unknown"
            });
          }
        },
        cancel: {
          label: "Cancel"
        }
      },
      default: "add"
    }, {
	classes: ["dg-ui-dialog", "dg-time-log-dialog"]}).render(true);
  }

  /* ---------------------------------------------------------------------- */
  /* UTILITIES                                                              */
  /* ---------------------------------------------------------------------- */

  static _parseDateTime(dateStr, timeStr) {
    const safeDate = (dateStr || "1989-01-01").trim();
    const safeTime = (timeStr || "00:00").trim();

    const [Y, M, D] = safeDate.split("-").map((n) => Number(n) || 0);
    const [h, m] = safeTime.split(":").map((n) => Number(n) || 0);

    const year = Y || 1989;
    const monthIndex = (M || 1) - 1;
    const day = D || 1;

    // 24h clock: we use h directly (0–23)
    return new Date(year, monthIndex, day, h || 0, m || 0, 0, 0);
  }

  static _formatForDisplay(d) {
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )}`;
    // 24h HH:MM
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const segment = this._segmentForHour(d.getHours());
    return { dateStr, timeStr, segment };
  }

  static _segmentForHour(h) {
    if (h >= 5 && h < 12) return "MORNING";
    if (h >= 12 && h < 17) return "AFTERNOON";
    if (h >= 17 && h < 21) return "EVENING";
    return "NIGHT";
  }
}
Hooks.once("init", () => {
  TimeManager.init();
});
