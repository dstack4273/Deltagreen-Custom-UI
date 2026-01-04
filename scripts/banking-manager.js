// banking-manager.js
// Simple funds tracking per Agent:
// - Stores data on the Actor as flags under "deltagreen-ui.bankAccount"
// - Players see read-only balances + log for THEIR current agent
// - GM sees same view plus a control panel that operates on a selected Agent

const MODULE_ID = "deltagreen-custom-ui";

export class BankingManager {
  static MAX_LOG_ENTRIES = 30;
  static gmSelectedActorId = null;
  static domWired = false;

  static init() {
    console.log("Delta Green UI | BankingManager init");

    // When the CRT UI DOM exists
    Hooks.on("renderDeltaGreenUI", () => {
      try {
        this._wireDomEvents();
        this.refresh();
      } catch (err) {
        console.error(
          "Delta Green UI | BankingManager renderDeltaGreenUI error:",
          err
        );
      }
    });

    // Refresh when an actor updates
    Hooks.on("updateActor", (actor) => {
      try {
        const display = this._getDisplayActor();
        if (display && actor.id === display.id) {
          this.refresh();
        }
      } catch (err) {
        console.error("Delta Green UI | BankingManager updateActor error:", err);
      }
    });

    // Changing controlled token changes who players see
    Hooks.on("controlToken", () => {
      try {
        this.refresh();
      } catch (err) {
        console.error(
          "Delta Green UI | BankingManager controlToken error:",
          err
        );
      }
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  // Current actor = controlled token (if exactly one), else assigned character
  static _getCurrentActor() {
    try {
      if (canvas && canvas.tokens && canvas.tokens.controlled?.length === 1) {
        return canvas.tokens.controlled[0].actor;
      }
    } catch (_e) {}
    if (game.user?.character) return game.user.character;
    return null;
  }

  // Actor whose balances we *display*:
  // - GM: whatever is selected in dropdown (if valid)
  // - Non-GM: _getCurrentActor()
  static _getDisplayActor() {
    if (game.user.isGM) {
      const select = document.getElementById("dg-bank-gm-actor");
      const selId = select?.value || this.gmSelectedActorId;
      if (selId) {
        const a = game.actors.get(selId);
        if (a) return a;
      }
    }
    return this._getCurrentActor();
  }

  // Only real PCs: type "agent" with a player owner
  static _getBankActors() {
    return game.actors.filter((a) => a.type === "agent" && a.hasPlayerOwner);
  }

static _normalizeAccount(raw) {
  const data = raw || {};
  return {
    cash: Number.isFinite(Number(data.cash)) ? Number(data.cash) : 0,
    account: Number.isFinite(Number(data.account)) ? Number(data.account) : 0,
    credit: Number.isFinite(Number(data.credit)) ? Number(data.credit) : 0,
    illicit: Number.isFinite(Number(data.illicit)) ? Number(data.illicit) : 0,
    log: Array.isArray(data.log) ? data.log.slice() : []
  };
}


  static async _saveAccount(actor, account) {
    if (!actor) return;
    const safe = this._normalizeAccount(account);

    // Trim log to last N entries
    if (safe.log.length > this.MAX_LOG_ENTRIES) {
      safe.log = safe.log.slice(-this.MAX_LOG_ENTRIES);
    }

    try {
      await actor.setFlag(MODULE_ID, "bankAccount", safe);
    } catch (err) {
      console.error("Delta Green UI | Error saving bank account:", err);
      ui.notifications?.error?.("BANK: Error saving account (see console).");
    }
  }

  static _formatCurrency(value) {
    const n = Number(value) || 0;
    const sign = n < 0 ? "-" : "";
    const abs = Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    return `${sign}$${abs}`;
  }

  static _formatDate(ts) {
    try {
      const d = new Date(ts || Date.now());
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit"
      });
    } catch (_e) {
      return "UNK DATE";
    }
  }

  // -----------------------------------------------------------------------
  // DOM wiring
  // -----------------------------------------------------------------------

  static _wireDomEvents() {
    const gmPanel = document.getElementById("dg-bank-gm-panel");

    if (!gmPanel) {
      console.warn("BANK | GM panel not found in DOM yet");
      return;
    }

    // Hide GM panel from players
    if (!game.user.isGM) {
      gmPanel.style.display = "none";
      this.domWired = true;
      return;
    }

    gmPanel.style.display = "";

    // Clear any old delegated handlers just in case
    if (window.jQuery) {
      $(document).off(".dgBank");
    }

    // Build dropdown for GM
    this._populateGmActorSelect();

    // Change target agent
    $(document)
      .off("change.dgBankActor", "#dg-bank-gm-actor")
      .on("change.dgBankActor", "#dg-bank-gm-actor", (ev) => {
        const select = ev.currentTarget;
        this.gmSelectedActorId = select.value || null;
        this.refresh();
      });

    // Apply transaction button
    $(document)
      .off("click.dgBankApply", "#dg-bank-gm-apply")
      .on("click.dgBankApply", "#dg-bank-gm-apply", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await this._handleApplyTransaction();
        this.refresh();
      });

    // Quick pay all button
    $(document)
      .off("click.dgBankQuickPay", "#dg-bank-gm-quickpay")
      .on("click.dgBankQuickPay", "#dg-bank-gm-quickpay", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await this._handleQuickPayAll();
        this.refresh();
      });

    this.domWired = true;
  }

  static _populateGmActorSelect() {
    const select = document.getElementById("dg-bank-gm-actor");
    if (!select) return;

    const actors = this._getBankActors();
    const previous = this.gmSelectedActorId;

    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- SELECT AGENT --";
    select.appendChild(placeholder);

    for (const actor of actors) {
      const opt = document.createElement("option");
      opt.value = actor.id;
      opt.textContent = actor.name || "Unnamed Agent";
      select.appendChild(opt);
    }

    // Restore previous selection if still valid
    if (previous && actors.some((a) => a.id === previous)) {
      select.value = previous;
    } else {
      // Else try to use current actor
      const current = this._getCurrentActor();
      if (current && actors.some((a) => a.id === current.id)) {
        select.value = current.id;
      }
    }

    this.gmSelectedActorId = select.value || null;
  }

  // -----------------------------------------------------------------------
  // GM actions
  // -----------------------------------------------------------------------

  static async _handleApplyTransaction() {
    if (!game.user.isGM) return;

    const select = document.getElementById("dg-bank-gm-actor");
    const fieldEl = document.getElementById("dg-bank-gm-field");
    const amtEl = document.getElementById("dg-bank-gm-amount");
    const noteEl = document.getElementById("dg-bank-gm-note");
    const dateEl = document.getElementById("dg-bank-gm-date");

    if (!select || !fieldEl || !amtEl) {
      ui.notifications?.error?.("BANK: GM controls not found in DOM.");
      return;
    }

    const actorId = select.value;
    if (!actorId) {
      ui.notifications?.warn?.("BANK: Choose a target Agent first.");
      return;
    }

    const actor = game.actors.get(actorId);
    if (!actor) {
      ui.notifications?.error?.("BANK: Selected Agent not found.");
      return;
    }

    const field = fieldEl.value || "account";
    const amount = Number(amtEl.value || 0);
    const note = (noteEl?.value || "").trim();
    const icDate = (dateEl?.value || "").trim(); // in-character date string

    if (!Number.isFinite(amount) || amount === 0) {
      ui.notifications?.warn?.("BANK: Enter a non-zero amount.");
      return;
    }

    const raw = actor.getFlag(MODULE_ID, "bankAccount") || {};
    const account = this._normalizeAccount(raw);

    account[field] = (Number(account[field]) || 0) + amount;

    const entry = {
      ts: Date.now(), // real timestamp for ordering
      icDate,         // IC date for display
      amount,
      field,
      note: note || (amount > 0 ? "ADJUSTMENT (+)" : "ADJUSTMENT (-)"),
      gm: game.user.name,
      actorId: actor.id
    };

    account.log.push(entry);

    await this._saveAccount(actor, account);

    ui.notifications?.info?.(
      `BANK: ${actor.name} ${
        amount > 0 ? "credited" : "debited"
      } ${this._formatCurrency(amount)} (${field.toUpperCase()})`
    );
  }

  static async _handleQuickPayAll() {
    if (!game.user.isGM) return;

    const amtEl = document.getElementById("dg-bank-gm-quick-amount");
    if (!amtEl) {
      ui.notifications?.error?.("BANK: Quick Pay input not found.");
      return;
    }

    const amount = Number(amtEl.value || 0);
    if (!Number.isFinite(amount) || amount === 0) {
      ui.notifications?.warn?.("BANK: Enter a non-zero amount for Quick Pay.");
      return;
    }

    const actors = this._getBankActors();
    const promises = [];

    for (const actor of actors) {
      const raw = actor.getFlag(MODULE_ID, "bankAccount") || {};
      const account = this._normalizeAccount(raw);

      account.account = (Number(account.account) || 0) + amount;

      const entry = {
        icDate: "Pay Day!", // you can fill later manually if you want
        amount,
        field: "account",
        note: "PAYCHECK",
        gm: game.user.name,
        actorId: actor.id
      };

      account.log.push(entry);
      promises.push(this._saveAccount(actor, account));
    }

    await Promise.all(promises);

    ui.notifications?.info?.(
      `BANK: Paid ${actors.length} agents ${this._formatCurrency(
        amount
      )} to ACCOUNT`
    );
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  static refresh() {
    const nameEl = document.getElementById("dg-bank-agent-name");
    const cashEl = document.getElementById("dg-bank-cash");
    const accountEl = document.getElementById("dg-bank-account");
    const creditEl = document.getElementById("dg-bank-credit");
	 const illicitEl = document.getElementById("dg-bank-illicit");
    const logEl = document.getElementById("dg-bank-log");

    // If the view isn't even in the DOM, don't bother
    if (!nameEl && !cashEl && !accountEl && !creditEl && !logEl) return;

    // Make sure events got wired even if the hook was weird
    if (!this.domWired) {
      this._wireDomEvents();
    }

    // GM panel visibility
    const gmPanel = document.getElementById("dg-bank-gm-panel");
    if (gmPanel) {
      gmPanel.style.display = game.user.isGM ? "" : "none";
    }

    // Keep GM dropdown up to date
    if (game.user.isGM) {
      this._populateGmActorSelect();
    }

    const actor = this._getDisplayActor();

    if (!actor) {
      if (nameEl) nameEl.textContent = "AGENT: NONE";
      if (cashEl) cashEl.textContent = "$0";
      if (accountEl) accountEl.textContent = "$0";
      if (creditEl) creditEl.textContent = "$0";
	   if (illicitEl) illicitEl.textContent = "$0";
      if (logEl) {
        logEl.innerHTML =
          '<li class="dg-result-item dg-no-entries">NO AGENT SELECTED</li>';
      }
      return;
    }

    const raw = actor.getFlag(MODULE_ID, "bankAccount") || {};
    const account = this._normalizeAccount(raw);

    if (nameEl) {
      nameEl.textContent = `${actor.name?.toUpperCase() || "UNKNOWN"}`;
    }
    if (cashEl) {
      cashEl.textContent = this._formatCurrency(account.cash);
    }
    if (accountEl) {
      accountEl.textContent = this._formatCurrency(account.account);
    }
    if (creditEl) {
      creditEl.textContent = this._formatCurrency(account.credit);
    }
if (illicitEl) {
  illicitEl.textContent = this._formatCurrency(account.illicit);
}
    if (logEl) {
      logEl.innerHTML = "";

      if (!account.log.length) {
        logEl.innerHTML =
          '<li class="dg-result-item dg-no-entries">NO RECORDED TRANSACTIONS</li>';
        return;
      }

      const recent = account.log.slice(-this.MAX_LOG_ENTRIES);

      for (const entry of recent) {
        const li = document.createElement("li");
        li.className = "dg-result-item";

        const dateStr =
          entry.icDate && entry.icDate.trim().length > 0
            ? entry.icDate.trim()
            : this._formatDate(entry.ts);

        const sign = entry.amount >= 0 ? "+" : "-";
        const field = (entry.field || "account").toUpperCase();
        const abs = this._formatCurrency(Math.abs(entry.amount));
        const note = entry.note || "";

        li.textContent =
          `[${dateStr}] ${sign}${abs} (${field})` +
          (note ? ` - ${note}` : "");

        logEl.appendChild(li);
      }
    }
  }
}
