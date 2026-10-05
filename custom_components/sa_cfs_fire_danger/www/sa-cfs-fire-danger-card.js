import { LitElement, html, css } from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";

/* -----------------------------------------------------------
 * Card metadata
 * ----------------------------------------------------------- */
window.customCards = window.customCards || [];
window.customCards.push({
  type: "sa-cfs-fire-danger-card",
  name: "SA CFS Fire Danger Card",
  description: "Displays the SA CFS Fire Danger Rating with optional fire ban overlay.",
  preview: true,
  configurable: true,
});

/* ===========================================================
 * CONFIG EDITOR (ha-form)
 * =========================================================== */
class SaCfsFireDangerCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = { ...config };
  }

  _schema(hass) {
    if (!hass) return [];

    const entityOptions = Object.keys(hass.states)
      .filter((e) => e.startsWith("sensor.sa_cfs_") && e.endsWith("_fire_danger_rating"))
      .map((e) => ({ value: e, label: e }))
      .sort((a, b) => a.value.localeCompare(b.value));

    return [
      {
        name: "entity",
        required: true,
        selector: {
          select: {
            options: entityOptions,
          },
        },
      },
      {
        name: "image_set",
        default: "Gauge 1",
        selector: {
          select: {
            options: [
              { value: "Gauge 1", label: "Gauge 1" },
              { value: "Gauge 2", label: "Gauge 2" },
              { value: "Gauge 3", label: "Gauge 3" },
            ],
          },
        },
      },
      {
        name: "overlay_fire_ban",
        default: false,
        selector: { boolean: {} },
      },
    ];
  }

  _valueChanged(ev) {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: ev.detail.value },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.hass || !this._config) return html``;

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._config}
        .schema=${this._schema(this.hass)}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

customElements.define(
  "sa-cfs-fire-danger-card-editor",
  SaCfsFireDangerCardEditor
);

/* ===========================================================
 * CARD IMPLEMENTATION
 * =========================================================== */
class SaCfsFireDangerCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  static getConfigElement() {
    return document.createElement("sa-cfs-fire-danger-card-editor");
  }

  static getStubConfig() {
    return {
      entity: "",
      image_set: "Gauge 1",
      overlay_fire_ban: false,
    };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define an entity");
    }
    this.config = config;
  }

  render() {
    const { entity, image_set = "Gauge 1", overlay_fire_ban = false } = this.config;
    const state = this.hass.states[entity];

    if (!state) {
      return html`
        <ha-card>
          <div class="card-content">Entity not found: ${entity}</div>
        </ha-card>
      `;
    }

    const prefixMap = {
      "Gauge 1": "afdr-gauge1-",
      "Gauge 2": "afdr-gauge2-",
      "Gauge 3": "afdr-gauge3-",
    };

    const suffixMap = {
      "No Rating": "norating.svg",
      "Moderate": "moderate.svg",
      "High": "high.svg",
      "Extreme": "extreme.svg",
      "Catastrophic": "catastrophic.svg",
    };

    const prefix = prefixMap[image_set];
    const suffix = suffixMap[state.state] || "unknown.svg";

    const baseImageUrl = `/hacsfiles/sa_cfs_fire_danger/${prefix}${suffix}`;

    const overlay =
      overlay_fire_ban && state.attributes?.day_1_fire_ban === true
        ? html`<img src="/hacsfiles/sa_cfs_fire_danger/fire_ban.svg?v=2" class="fire-ban-overlay" />`
        : "";

    return html`
      <ha-card>
        <div class="card-container">
          <img src="${baseImageUrl}" class="rating-image" />
          ${overlay}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      .card-container {
        position: relative;
        line-height: 0;
      }

      .rating-image {
        width: 100%;
        display: block;
      }

      /* Move fire ban overlay to top-left corner */
      .fire-ban-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 30%;       /* adjust size as needed */
        height: auto;
        pointer-events: none;
      }
    `;
  }

  getCardSize() {
    return 1;
  }
}

customElements.define("sa-cfs-fire-danger-card", SaCfsFireDangerCard);

/* ===========================================================
 * FORECAST TABLE CARD
 * =========================================================== */
window.customCards.push({
  type: "sa-cfs-fire-danger-table-card",
  name: "SA CFS Fire Danger Table",
  description: "Multi-day fire danger ratings, FBI and total fire bans for several districts.",
  preview: true,
  configurable: true,
});

const INTEGRATION = "sa_cfs_fire_danger";
const SUMMARY_ENTITY = "sensor.sa_cfs_fire_danger_summary";
const MAX_DAYS = 5;

const TABLE_DEFAULTS = {
  days: 4,
  show_fbi: true,
  show_fire_ban: true,
  fire_ban_display: "banner",
  flash_interval: 1,
  show_dates: true,
  show_footer: true,
};

const RATING_STYLES = {
  "No Rating": { background: "transparent", color: "var(--primary-text-color)" },
  Moderate: { background: "#64bf30", color: "#000000" },
  High: { background: "#fedd3a", color: "#000000" },
  Extreme: { background: "#f78100", color: "#000000" },
  Catastrophic: { background: "#ad0909", color: "#ffffff" },
};

const isRatingEntity = (entityId) =>
  entityId.startsWith("sensor.sa_cfs_") && entityId.endsWith("_fire_danger_rating");

class SaCfsFireDangerTableCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = { ...config };
  }

  _schema(data) {
    const schema = [
      { name: "title", selector: { text: {} } },
      {
        name: "entities",
        selector: {
          entity: {
            multiple: true,
            filter: { integration: INTEGRATION, domain: "sensor", device_class: "enum" },
          },
        },
      },
      {
        name: "days",
        selector: { number: { min: 1, max: MAX_DAYS, mode: "slider" } },
      },
      { name: "show_fbi", selector: { boolean: {} } },
      { name: "show_dates", selector: { boolean: {} } },
      { name: "show_footer", selector: { boolean: {} } },
      { name: "show_fire_ban", selector: { boolean: {} } },
    ];

    if (data.show_fire_ban) {
      schema.push({
        name: "fire_ban_display",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "banner", label: "Banner below the rating" },
              { value: "flash", label: "Alternate with the rating" },
            ],
          },
        },
      });
      if (data.fire_ban_display === "flash") {
        schema.push({
          name: "flash_interval",
          selector: {
            number: { min: 0.25, max: 5, step: 0.25, mode: "box", unit_of_measurement: "s" },
          },
        });
      }
    }
    return schema;
  }

  _computeLabel(schema) {
    return {
      title: "Title",
      entities: "Districts (leave empty for all)",
      days: "Days to show",
      show_fbi: "Show fire behaviour index",
      show_dates: "Show dates in headings",
      show_footer: "Show issued time footer",
      show_fire_ban: "Show total fire bans",
      fire_ban_display: "Fire ban display",
      flash_interval: "Alternate every",
    }[schema.name];
  }

  _valueChanged(ev) {
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: ev.detail.value },
        bubbles: true,
        composed: true,
      })
    );
  }

  render() {
    if (!this.hass || !this._config) return html``;

    const data = { ...TABLE_DEFAULTS, ...this._config };
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${this._schema(data)}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

customElements.define(
  "sa-cfs-fire-danger-table-card-editor",
  SaCfsFireDangerTableCardEditor
);

class SaCfsFireDangerTableCard extends LitElement {
  static get properties() {
    return {
      hass: {},
      config: {},
    };
  }

  static getConfigElement() {
    return document.createElement("sa-cfs-fire-danger-table-card-editor");
  }

  static getStubConfig() {
    return { title: "SA CFS Fire Danger Ratings", days: TABLE_DEFAULTS.days };
  }

  setConfig(config) {
    const days = Number(config.days ?? TABLE_DEFAULTS.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new Error(`days must be between 1 and ${MAX_DAYS}`);
    }
    const flashInterval = Number(config.flash_interval ?? TABLE_DEFAULTS.flash_interval);
    if (!(flashInterval > 0)) {
      throw new Error("flash_interval must be a positive number of seconds");
    }
    if (config.fire_ban_display && !["banner", "flash"].includes(config.fire_ban_display)) {
      throw new Error("fire_ban_display must be banner or flash");
    }
    if (config.entities && !Array.isArray(config.entities)) {
      throw new Error("entities must be a list");
    }
    this.config = { ...TABLE_DEFAULTS, ...config, days, flash_interval: flashInterval };
  }

  _entityIds() {
    const configured = (this.config.entities || []).map((e) =>
      typeof e === "string" ? e : e.entity
    );
    if (configured.length) {
      return configured.filter((id) => this.hass.states[id]);
    }
    return Object.keys(this.hass.states)
      .filter(isRatingEntity)
      .sort((a, b) =>
        this._districtName(this.hass.states[a]).localeCompare(
          this._districtName(this.hass.states[b])
        )
      );
  }

  _districtName(stateObj) {
    return (
      stateObj.attributes.district_name ||
      stateObj.attributes.friendly_name ||
      stateObj.entity_id
    );
  }

  _headings() {
    // Prefer the integration's own day labels so headings always match the data.
    const summary = this.hass.states[SUMMARY_ENTITY];
    const headings = [];
    for (let day = 1; day <= this.config.days; day++) {
      let label;
      let short;
      if (day === 1) label = "Today";
      else if (day === 2) [label, short] = ["Tomorrow", "Tmrw"];
      else if (summary?.attributes[`day_${day}_name`]) {
        label = summary.attributes[`day_${day}_name`].slice(0, 3);
      } else {
        label = `Day ${day}`;
      }
      const date = summary?.attributes[`day_${day}_date`];
      headings.push({ label, short: short || label, date });
    }
    return headings;
  }

  _moreInfo(entityId) {
    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        detail: { entityId },
        bubbles: true,
        composed: true,
      })
    );
  }

  _renderBan(extraClass = "") {
    // Both labels are rendered; a container query picks the one that fits.
    return html`<div class="fire-ban ${extraClass}">
      <span class="ban-long">TOTAL FIRE BAN</span><span class="ban-short">FIRE BAN</span>
    </div>`;
  }

  _renderCell(attrs, day) {
    const rating = attrs[`day_${day}_rating`];
    const fbi = attrs[`day_${day}_fbi`];
    const fireBan = this.config.show_fire_ban && attrs[`day_${day}_fire_ban`] === true;

    if (rating === null || rating === undefined) {
      return html`<td class="cell"><div class="inner empty">–</div></td>`;
    }

    const style = RATING_STYLES[rating] || RATING_STYLES["No Rating"];
    const ratingBox = html`<div
      class="rating ${rating === "No Rating" ? "no-rating" : ""}"
      style="background:${style.background};color:${style.color}"
      title=${rating}
    >
      ${rating}
    </div>`;
    const flash = fireBan && this.config.fire_ban_display === "flash";

    return html`
      <td class="cell">
        <div class="inner">
          ${flash
            ? html`<div class="flash">
                <div class="flash-rating">${ratingBox}</div>
                ${this._renderBan("flash-ban")}
              </div>`
            : ratingBox}
          ${this.config.show_fbi && fbi !== null && fbi !== undefined
            ? html`<div class="fbi" title="Fire behaviour index">FBI ${fbi}</div>`
            : ""}
          ${fireBan && !flash ? this._renderBan() : ""}
        </div>
      </td>
    `;
  }

  _renderFooter() {
    if (!this.config.show_footer) return "";
    const summary = this.hass.states[SUMMARY_ENTITY];
    if (!summary || !summary.state || ["unknown", "unavailable"].includes(summary.state)) {
      return "";
    }
    const when = new Date(summary.state);
    if (isNaN(when)) return "";
    const formatted = when.toLocaleString(this.hass.locale?.language || undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: this.hass.config?.time_zone || undefined,
    });
    return html`<div class="footer">Issued ${formatted}</div>`;
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const entityIds = this._entityIds();
    const headings = this._headings();

    return html`
      <ha-card .header=${this.config.title}>
        <div
          class="card-content"
          style="--flash-period:${this.config.flash_interval * 2}s"
        >
          ${entityIds.length === 0
            ? html`<div class="none">
                No SA CFS district sensors found. Select districts in the integration options.
              </div>`
            : html`
                <table>
                  <colgroup>
                    <col class="district-col" />
                    ${headings.map(() => html`<col />`)}
                  </colgroup>
                  <thead>
                    <tr>
                      <th class="district">District</th>
                      ${headings.map(
                        (h) => html`<th>
                          <div class="head">
                            <span class="label-long">${h.label}</span
                            ><span class="label-short">${h.short}</span>
                          </div>
                          ${this.config.show_dates && h.date
                            ? html`<div class="date">${h.date}</div>`
                            : ""}
                        </th>`
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    ${entityIds.map((id) => {
                      const stateObj = this.hass.states[id];
                      return html`
                        <tr>
                          <td class="district" @click=${() => this._moreInfo(id)}>
                            ${this._districtName(stateObj)}
                          </td>
                          ${headings.map((_, i) =>
                            this._renderCell(stateObj.attributes, i + 1)
                          )}
                        </tr>
                      `;
                    })}
                  </tbody>
                </table>
              `}
          ${this._renderFooter()}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      table {
        width: 100%;
        border-collapse: collapse;
        /* Fixed layout gives every day column the same width. */
        table-layout: fixed;
      }

      .district-col {
        width: 28%;
      }

      th {
        font-weight: 500;
        padding: 4px 2px;
        text-align: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      th .date {
        font-size: 0.8em;
        font-weight: 400;
        color: var(--secondary-text-color);
      }

      td {
        padding: 4px 2px;
        border-top: 1px solid var(--divider-color);
      }

      .district {
        text-align: left;
      }

      td.district {
        cursor: pointer;
        font-weight: 500;
        overflow-wrap: anywhere;
      }

      .cell {
        text-align: center;
        vertical-align: top;
      }

      .inner,
      .head {
        container-type: inline-size;
      }

      .label-short {
        display: none;
      }

      @container (max-width: 70px) {
        .label-long {
          display: none;
        }
        .label-short {
          display: inline;
        }
      }

      .inner.empty {
        color: var(--secondary-text-color);
      }

      .rating,
      .fire-ban {
        border-radius: 4px;
        padding: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      /* Text scales with the column so "Catastrophic" fits; ellipsis only below the floor size. */
      .rating {
        font-weight: 500;
        font-size: clamp(9px, 14cqi, 1em);
      }

      .rating.no-rating {
        border: 1px solid var(--divider-color);
        padding: 1px;
      }

      .fbi {
        font-size: clamp(8px, 14cqi, 0.8em);
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .fire-ban {
        background: #ff0000;
        color: #ffffff;
        font-size: clamp(8px, 15cqi, 0.75em);
        font-weight: 700;
        margin-top: 2px;
      }

      .ban-short {
        display: none;
      }

      @container (max-width: 100px) {
        .ban-long {
          display: none;
        }
        .ban-short {
          display: inline;
        }
      }



      /* Flash mode: the rating and the fire ban share one slot and alternate. */
      .flash {
        display: grid;
      }

      .flash > * {
        grid-area: 1 / 1;
      }

      .flash .flash-ban {
        margin-top: 0;
        font-size: clamp(8px, 14cqi, 0.9em);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: sa-cfs-flash-second var(--flash-period, 2s) step-end infinite;
      }

      .flash .flash-rating {
        animation: sa-cfs-flash-first var(--flash-period, 2s) step-end infinite;
      }

      /* Rating shows for the first half of each period, the fire ban for the second. */
      @keyframes sa-cfs-flash-first {
        0% {
          visibility: visible;
        }
        50% {
          visibility: hidden;
        }
      }

      @keyframes sa-cfs-flash-second {
        0% {
          visibility: hidden;
        }
        50% {
          visibility: visible;
        }
      }

      .footer {
        margin-top: 8px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
        text-align: right;
      }

      .none {
        color: var(--secondary-text-color);
      }
    `;
  }

  getCardSize() {
    return this.hass && this.config ? 2 + this._entityIds().length : 3;
  }
}

customElements.define("sa-cfs-fire-danger-table-card", SaCfsFireDangerTableCard);
