import { LitElement, html, svg, css } from "https://unpkg.com/lit-element@2.0.1/lit-element.js?module";
import { VIEWBOX, DISTRICTS } from "./sa-cfs-map-data.js";

/* -----------------------------------------------------------
 * Registration helpers
 *
 * The file can end up loaded twice (e.g. an old Lovelace resource as well as
 * the integration's own loader, or a cached copy). Skipping anything already
 * registered keeps the second copy from throwing "already defined" and
 * stopping before later cards are registered.
 * ----------------------------------------------------------- */
window.customCards = window.customCards || [];

const registerCard = (card) => {
  if (!window.customCards.some((c) => c.type === card.type)) {
    window.customCards.push(card);
  }
};

const defineElement = (name, cls) => {
  if (!customElements.get(name)) {
    customElements.define(name, cls);
  }
};

/* -----------------------------------------------------------
 * Card metadata
 * ----------------------------------------------------------- */
registerCard({
  type: "sa-cfs-fire-danger-card",
  name: "SA CFS Fire Danger Gauge Card",
  description: "Today's fire danger rating for one district as a gauge, with an optional fire ban overlay.",
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
      { name: "show_title", selector: { boolean: {} } },
      { name: "title", selector: { text: {} } },
    ];
  }

  _computeLabel(schema) {
    return {
      entity: "District",
      image_set: "Gauge style",
      overlay_fire_ban: "Show fire ban overlay",
      show_title: "Show title",
      title: "Title (leave empty for the district name)",
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

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ show_title: true, ...this._config }}
        .schema=${this._schema(this.hass)}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

defineElement(
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

  static getStubConfig(hass) {
    // Pick a real district so the card picker can show a preview.
    const entity =
      Object.keys(hass?.states || {})
        .filter((e) => e.startsWith("sensor.sa_cfs_") && e.endsWith("_fire_danger_rating"))
        .sort()[0] || "";
    return {
      entity,
      image_set: "Gauge 1",
      overlay_fire_ban: false,
      show_title: true,
    };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define an entity");
    }
    this.config = config;
  }

  render() {
    const {
      entity,
      image_set = "Gauge 1",
      overlay_fire_ban = false,
      show_title = true,
    } = this.config;
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

    const title = show_title
      ? this.config.title || state.attributes.district_name || state.attributes.friendly_name
      : undefined;

    return html`
      <ha-card>
        ${title ? html`<div class="title">${title}</div>` : ""}
        <div class="card-container">
          <img src="${baseImageUrl}" class="rating-image" />
          ${overlay}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      /* Own title instead of the ha-card header, whose padding leaves a large gap above the gauge. */
      .title {
        font-family: var(--ha-card-header-font-family, inherit);
        font-size: var(--ha-card-header-font-size, 24px);
        color: var(--ha-card-header-color, var(--primary-text-color));
        letter-spacing: -0.012em;
        line-height: 32px;
        /* Title text lines up with the standard ha-card header used by the other cards. */
        padding: 20px 16px 4px;
      }

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
    return this.config?.show_title === false ? 1 : 2;
  }
}

defineElement("sa-cfs-fire-danger-card", SaCfsFireDangerCard);

/* ===========================================================
 * FORECAST TABLE CARD
 * =========================================================== */
registerCard({
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
  today_tomorrow: true,
  day_names: "short",
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

const formatDayName = (name, format) => (format === "short" ? name.slice(0, 3) : name);

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
      { name: "today_tomorrow", selector: { boolean: {} } },
      {
        name: "day_names",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "short", label: "Short (Mon)" },
              { value: "long", label: "Long (Monday)" },
            ],
          },
        },
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
      today_tomorrow: "Label the first two days Today / Tomorrow",
      day_names: "Day names",
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

defineElement(
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
    if (config.day_names && !["short", "long"].includes(config.day_names)) {
      throw new Error("day_names must be short or long");
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
      if (this.config.today_tomorrow && day === 1) label = "Today";
      else if (this.config.today_tomorrow && day === 2) [label, short] = ["Tomorrow", "Tmrw"];
      else if (summary?.attributes[`day_${day}_name`]) {
        const name = summary.attributes[`day_${day}_name`];
        label = formatDayName(name, this.config.day_names);
        // Narrow columns always fall back to the 3-letter name.
        short = formatDayName(name, "short");
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

defineElement("sa-cfs-fire-danger-table-card", SaCfsFireDangerTableCard);

/* ===========================================================
 * SINGLE DISTRICT FORECAST CARD
 * =========================================================== */
registerCard({
  type: "sa-cfs-fire-danger-district-card",
  name: "SA CFS Fire Danger District Forecast",
  description: "Day-by-day rating, FBI and total fire ban for one district.",
  preview: true,
  configurable: true,
});

const DISTRICT_DEFAULTS = {
  days: 4,
  today_tomorrow: false,
  day_names: "long",
  show_title: true,
  show_dates: true,
  show_fbi: true,
  show_fire_ban: true,
  show_footer: true,
};

class SaCfsFireDangerDistrictCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = { ...config };
  }

  _schema() {
    return [
      {
        name: "entity",
        required: true,
        selector: {
          entity: {
            filter: { integration: INTEGRATION, domain: "sensor", device_class: "enum" },
          },
        },
      },
      { name: "show_title", selector: { boolean: {} } },
      { name: "title", selector: { text: {} } },
      {
        name: "days",
        selector: { number: { min: 1, max: MAX_DAYS, mode: "slider" } },
      },
      { name: "today_tomorrow", selector: { boolean: {} } },
      {
        name: "day_names",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "short", label: "Short (Mon)" },
              { value: "long", label: "Long (Monday)" },
            ],
          },
        },
      },
      { name: "show_dates", selector: { boolean: {} } },
      { name: "show_fbi", selector: { boolean: {} } },
      { name: "show_fire_ban", selector: { boolean: {} } },
      { name: "show_footer", selector: { boolean: {} } },
    ];
  }

  _computeLabel(schema) {
    return {
      entity: "District",
      show_title: "Show title",
      title: "Title (leave empty for \"<District> District\")",
      days: "Days to show",
      today_tomorrow: "Label the first two days Today / Tomorrow",
      day_names: "Day names",
      show_dates: "Show dates",
      show_fbi: "Show fire behaviour index column",
      show_fire_ban: "Show fire ban column",
      show_footer: "Show issued time footer",
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

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ ...DISTRICT_DEFAULTS, ...this._config }}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

defineElement(
  "sa-cfs-fire-danger-district-card-editor",
  SaCfsFireDangerDistrictCardEditor
);

class SaCfsFireDangerDistrictCard extends SaCfsFireDangerTableCard {
  static getConfigElement() {
    return document.createElement("sa-cfs-fire-danger-district-card-editor");
  }

  static getStubConfig(hass) {
    const entity = Object.keys(hass?.states || {}).filter(isRatingEntity).sort()[0] || "";
    return { entity, days: DISTRICT_DEFAULTS.days };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("You must define an entity");
    }
    const days = Number(config.days ?? DISTRICT_DEFAULTS.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new Error(`days must be between 1 and ${MAX_DAYS}`);
    }
    if (config.day_names && !["short", "long"].includes(config.day_names)) {
      throw new Error("day_names must be short or long");
    }
    this.config = { ...DISTRICT_DEFAULTS, ...config, days };
  }

  _dayName(day) {
    if (this.config.today_tomorrow && day === 1) return "Today";
    if (this.config.today_tomorrow && day === 2) return "Tomorrow";
    const summary = this.hass.states[SUMMARY_ENTITY];
    const name = summary?.attributes[`day_${day}_name`];
    if (name) return formatDayName(name, this.config.day_names);
    return day === 1 ? "Today" : `Day ${day}`;
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const stateObj = this.hass.states[this.config.entity];
    if (!stateObj) {
      return html`
        <ha-card>
          <div class="card-content">Entity not found: ${this.config.entity}</div>
        </ha-card>
      `;
    }

    const attrs = stateObj.attributes;
    const summary = this.hass.states[SUMMARY_ENTITY];
    const title = this.config.show_title
      ? this.config.title || `${this._districtName(stateObj)} District`
      : undefined;
    const days = Array.from({ length: this.config.days }, (_, i) => i + 1);

    return html`
      <ha-card .header=${title}>
        <div class="card-content">
          <table class="district-table">
            <colgroup>
              <col class="day-col" />
              <col />
              ${this.config.show_fbi ? html`<col class="narrow-col" />` : ""}
              ${this.config.show_fire_ban ? html`<col />` : ""}
            </colgroup>
            <thead>
              <tr>
                <th class="district">Day</th>
                <th>Rating</th>
                ${this.config.show_fbi ? html`<th>FBI</th>` : ""}
                ${this.config.show_fire_ban ? html`<th>Fire Ban</th>` : ""}
              </tr>
            </thead>
            <tbody>
              ${days.map((day) => {
                const rating = attrs[`day_${day}_rating`];
                const fbi = attrs[`day_${day}_fbi`];
                const fireBan = attrs[`day_${day}_fire_ban`];
                const style = RATING_STYLES[rating] || RATING_STYLES["No Rating"];
                const date = summary?.attributes[`day_${day}_date`];
                const missing = rating === null || rating === undefined;
                return html`
                  <tr @click=${() => this._moreInfo(this.config.entity)}>
                    <td class="district">
                      <div>${this._dayName(day)}</div>
                      ${this.config.show_dates && date
                        ? html`<div class="date">${date}</div>`
                        : ""}
                    </td>
                    <td class="cell middle">
                      <div class="inner">
                        ${missing
                          ? html`<span class="muted">–</span>`
                          : html`<div
                              class="rating ${rating === "No Rating" ? "no-rating" : ""}"
                              style="background:${style.background};color:${style.color}"
                              title=${rating}
                            >
                              ${rating}
                            </div>`}
                      </div>
                    </td>
                    ${this.config.show_fbi
                      ? html`<td class="cell middle">
                          ${fbi === null || fbi === undefined
                            ? html`<span class="muted">–</span>`
                            : fbi}
                        </td>`
                      : ""}
                    ${this.config.show_fire_ban
                      ? html`<td class="cell middle">
                          <div class="inner">
                            ${fireBan === true
                              ? this._renderBan("in-column")
                              : html`<span class="muted"
                                  >${fireBan === false ? "No" : "–"}</span
                                >`}
                          </div>
                        </td>`
                      : ""}
                  </tr>
                `;
              })}
            </tbody>
          </table>
          ${this._renderFooter()}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return [
      super.styles,
      css`
        .district-table .day-col {
          width: 32%;
        }

        .district-table .narrow-col {
          width: 16%;
        }

        .district-table tbody tr {
          cursor: pointer;
        }

        .district-table td.district {
          font-weight: 500;
        }

        .date {
          font-size: 0.8em;
          font-weight: 400;
          color: var(--secondary-text-color);
        }

        .middle {
          vertical-align: middle;
        }

        .muted {
          color: var(--secondary-text-color);
        }

        .fire-ban.in-column {
          margin-top: 0;
        }
      `,
    ];
  }

  getCardSize() {
    return 2 + (this.config?.days || DISTRICT_DEFAULTS.days);
  }
}

defineElement("sa-cfs-fire-danger-district-card", SaCfsFireDangerDistrictCard);

/* ===========================================================
 * MAP CARD
 * =========================================================== */
registerCard({
  type: "sa-cfs-fire-danger-map-card",
  name: "SA CFS Fire Danger Map",
  description: "Map of South Australia's fire ban districts with ratings and total fire bans by day.",
  preview: true,
  configurable: true,
});

const MAP_DEFAULTS = {
  show_title: true,
  days: 4,
  today_tomorrow: true,
  day_names: "short",
  show_dates: false,
  show_fire_ban: true,
  show_legend: true,
  show_footer: true,
};

const MAP_TITLE = "SA Fire Danger Ratings";
const [, , MAP_WIDTH, MAP_HEIGHT] = VIEWBOX.split(" ").map(Number);
const MISSING_FILL = "var(--disabled-color, #9e9e9e)";
// Light grey rather than white so No Rating districts stay visible on a white card.
const NO_RATING_FILL = "#e6e6e6";
const FIRE_BAN_ICON = "/hacsfiles/sa_cfs_fire_danger/fire_ban.svg?v=2";
const FIRE_BAN_ICON_SIZE = 84;

class SaCfsFireDangerMapCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = { ...config };
  }

  _schema() {
    return [
      { name: "show_title", selector: { boolean: {} } },
      { name: "title", selector: { text: {} } },
      {
        name: "days",
        selector: { number: { min: 1, max: MAX_DAYS, mode: "slider" } },
      },
      { name: "today_tomorrow", selector: { boolean: {} } },
      {
        name: "day_names",
        selector: {
          select: {
            mode: "dropdown",
            options: [
              { value: "short", label: "Short (Mon)" },
              { value: "long", label: "Long (Monday)" },
            ],
          },
        },
      },
      { name: "show_dates", selector: { boolean: {} } },
      { name: "show_fire_ban", selector: { boolean: {} } },
      { name: "show_legend", selector: { boolean: {} } },
      { name: "show_footer", selector: { boolean: {} } },
    ];
  }

  _computeLabel(schema) {
    return {
      show_title: "Show title",
      title: `Title (leave empty for "${MAP_TITLE}")`,
      days: "Days to choose from",
      today_tomorrow: "Label the first two days Today / Tomorrow",
      day_names: "Day names",
      show_dates: "Show dates on the day buttons",
      show_fire_ban: "Show total fire ban icons",
      show_legend: "Show rating legend",
      show_footer: "Show issued time footer",
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

    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ ...MAP_DEFAULTS, ...this._config }}
        .schema=${this._schema()}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }
}

defineElement("sa-cfs-fire-danger-map-card-editor", SaCfsFireDangerMapCardEditor);

class SaCfsFireDangerMapCard extends SaCfsFireDangerTableCard {
  static get properties() {
    return {
      ...super.properties,
      _day: {},
      _selected: {},
    };
  }

  constructor() {
    super();
    this._day = 0;
    this._selected = null;
  }

  static getConfigElement() {
    return document.createElement("sa-cfs-fire-danger-map-card-editor");
  }

  static getStubConfig() {
    return {};
  }

  setConfig(config) {
    const days = Number(config.days ?? MAP_DEFAULTS.days);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new Error(`days must be between 1 and ${MAX_DAYS}`);
    }
    if (config.day_names && !["short", "long"].includes(config.day_names)) {
      throw new Error("day_names must be short or long");
    }
    this.config = { ...MAP_DEFAULTS, ...config, days };
    if (this._day >= days) this._day = 0;
  }

  _forecast(key) {
    const district = this.hass.states[SUMMARY_ENTITY]?.attributes.districts?.[key];
    return district?.forecast?.[this._day] || null;
  }

  _fill(forecast) {
    const rating = forecast?.rating;
    if (!rating) return MISSING_FILL;
    if (rating === "No Rating") return NO_RATING_FILL;
    return (RATING_STYLES[rating] || {}).background || MISSING_FILL;
  }

  _select(ev, key) {
    ev.stopPropagation();
    this._selected = this._selected === key ? null : key;
  }

  _onKey(ev, key) {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      this._select(ev, key);
    }
  }

  _setDay(ev, day) {
    ev.stopPropagation();
    this._day = day;
  }

  _renderDayButtons() {
    if (this.config.days < 2) return "";
    return html`
      <div class="days" role="group" aria-label="Forecast day">
        ${this._headings().map(
          (h, i) => html`<button
            class="day ${i === this._day ? "selected" : ""}"
            aria-pressed=${i === this._day ? "true" : "false"}
            @click=${(ev) => this._setDay(ev, i)}
          >
            <span class="label-long">${h.label}</span><span class="label-short">${h.short}</span>
            ${this.config.show_dates && h.date ? html`<span class="day-date">${h.date}</span>` : ""}
          </button>`
        )}
      </div>
    `;
  }

  _renderMap() {
    const keys = Object.keys(DISTRICTS);
    const bans = this.config.show_fire_ban
      ? keys.filter((key) => this._forecast(key)?.fire_ban === true)
      : [];
    const selected = this._selected && DISTRICTS[this._selected];

    return svg`
      <svg class="map" viewBox=${VIEWBOX} role="img" aria-label="Fire danger map of South Australia">
        ${keys.map((key) => {
          const forecast = this._forecast(key);
          return svg`<path
            class="district"
            d=${DISTRICTS[key].path}
            fill=${this._fill(forecast)}
            tabindex="0"
            role="button"
            aria-label=${`${DISTRICTS[key].name}: ${forecast?.rating || "no data"}`}
            @click=${(ev) => this._select(ev, key)}
            @keydown=${(ev) => this._onKey(ev, key)}
          ></path>`;
        })}
        ${selected ? svg`<path class="outline" d=${selected.path}></path>` : ""}
        ${bans.map(
          (key) => svg`<circle
            class="ban-backdrop"
            cx=${DISTRICTS[key].label[0]}
            cy=${DISTRICTS[key].label[1]}
            r=${FIRE_BAN_ICON_SIZE * 0.46}
          ></circle><image
            class="ban-icon"
            href=${FIRE_BAN_ICON}
            x=${DISTRICTS[key].label[0] - FIRE_BAN_ICON_SIZE / 2}
            y=${DISTRICTS[key].label[1] - FIRE_BAN_ICON_SIZE / 2}
            width=${FIRE_BAN_ICON_SIZE}
            height=${FIRE_BAN_ICON_SIZE}
          ></image>`
        )}
      </svg>
    `;
  }

  _renderPopup() {
    const key = this._selected;
    if (!key || !DISTRICTS[key]) return "";
    const forecast = this._forecast(key) || {};
    const [x, y] = DISTRICTS[key].label;
    const left = (x / MAP_WIDTH) * 100;
    const top = (y / MAP_HEIGHT) * 100;
    // Keep the popup inside the map: open below points near the top, and
    // anchor to the nearest side near the left/right edges.
    const horizontal = left < 30 ? "0%" : left > 70 ? "-100%" : "-50%";
    const vertical = top < 30 ? "16px" : "calc(-100% - 16px)";
    const rating = forecast.rating;
    const style = RATING_STYLES[rating] || RATING_STYLES["No Rating"];
    const heading = this._headings()[this._day];

    return html`
      <div
        class="popup"
        style="left:${left}%;top:${top}%;transform:translate(${horizontal}, ${vertical})"
        @click=${(ev) => ev.stopPropagation()}
      >
        <button class="close" aria-label="Close" @click=${() => (this._selected = null)}>✕</button>
        <div class="popup-name">${DISTRICTS[key].name}</div>
        <div class="popup-day">${heading?.label}${heading?.date ? ` ${heading.date}` : ""}</div>
        ${rating
          ? html`<div
              class="rating ${rating === "No Rating" ? "no-rating" : ""}"
              style="background:${style.background};color:${style.color}"
            >
              ${rating}
            </div>`
          : html`<div class="popup-line muted">No forecast</div>`}
        ${forecast.fbi !== null && forecast.fbi !== undefined
          ? html`<div class="popup-line">FBI ${forecast.fbi}</div>`
          : ""}
        ${forecast.fire_ban === true
          ? html`<div class="fire-ban popup-ban">TOTAL FIRE BAN</div>`
          : forecast.fire_ban === false
          ? html`<div class="popup-line muted">No total fire ban</div>`
          : ""}
      </div>
    `;
  }

  _renderLegend() {
    if (!this.config.show_legend) return "";
    return html`
      <div class="legend">
        ${Object.keys(RATING_STYLES).map(
          (rating) => html`<span class="legend-item">
            <span
              class="swatch ${rating === "No Rating" ? "no-rating" : ""}"
              style="background:${rating === "No Rating" ? NO_RATING_FILL : RATING_STYLES[rating].background}"
            ></span
            >${rating}
          </span>`
        )}
      </div>
    `;
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const hasData = !!this.hass.states[SUMMARY_ENTITY]?.attributes.districts;
    const title = this.config.show_title ? this.config.title || MAP_TITLE : undefined;

    return html`
      <ha-card .header=${title}>
        <div class="card-content" @click=${() => (this._selected = null)}>
          <div class="map-wrap">
            ${this._renderDayButtons()} ${this._renderMap()} ${this._renderPopup()}
          </div>
          ${hasData
            ? ""
            : html`<div class="none">
                Waiting for ${SUMMARY_ENTITY}. Check the SA CFS Fire Danger integration is set up.
              </div>`}
          ${this._renderLegend()} ${this._renderFooter()}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return [
      super.styles,
      css`
        .map-wrap {
          position: relative;
          container-type: inline-size;
        }

        .map {
          display: block;
          width: 100%;
          height: auto;
        }

        .district {
          stroke: var(--card-background-color, #ffffff);
          stroke-width: 1.5px;
          vector-effect: non-scaling-stroke;
          stroke-linejoin: round;
          cursor: pointer;
          outline: none;
        }

        .district:hover,
        .district:focus-visible {
          filter: brightness(0.92);
        }

        .outline {
          fill: none;
          stroke: var(--primary-text-color, #212121);
          stroke-width: 3px;
          vector-effect: non-scaling-stroke;
          stroke-linejoin: round;
          pointer-events: none;
        }

        .ban-icon,
        .ban-backdrop {
          pointer-events: none;
        }

        /* White disc so the red icon stands out on Extreme/Catastrophic districts. */
        .ban-backdrop {
          fill: #ffffff;
        }

        /* Day buttons sit over SA's straight northern border. */
        .days {
          position: absolute;
          top: 8px;
          left: 8px;
          right: 8px;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 4px;
          z-index: 1;
        }

        .day {
          display: flex;
          flex-direction: column;
          align-items: center;
          font: inherit;
          font-size: 0.9em;
          line-height: 1.2;
          padding: 4px 10px;
          border-radius: 16px;
          border: 1px solid var(--divider-color, #e0e0e0);
          background: var(--card-background-color, #ffffff);
          color: var(--primary-text-color, #212121);
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .day.selected {
          background: var(--primary-color, #03a9f4);
          border-color: var(--primary-color, #03a9f4);
          color: var(--text-primary-color, #ffffff);
        }

        .day-date {
          font-size: 0.8em;
          opacity: 0.8;
        }

        @container (max-width: 360px) {
          .day .label-long {
            display: none;
          }
          .day .label-short {
            display: inline;
          }
          .day {
            padding: 3px 8px;
          }
        }

        .popup {
          position: absolute;
          z-index: 2;
          min-width: 150px;
          max-width: 60%;
          background: var(--card-background-color, #ffffff);
          color: var(--primary-text-color, #212121);
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
          padding: 8px 28px 8px 10px;
          font-size: 0.9em;
        }

        .popup .rating {
          display: inline-block;
          padding: 2px 8px;
          margin-top: 4px;
          font-size: 1em;
        }

        .popup-name {
          font-weight: 500;
        }

        .popup-day,
        .muted {
          color: var(--secondary-text-color, #727272);
        }

        .popup-line {
          margin-top: 4px;
        }

        .popup-ban {
          display: inline-block;
          margin-top: 4px;
          padding: 2px 6px;
          font-size: 0.8em;
        }

        .close {
          position: absolute;
          top: 4px;
          right: 4px;
          border: none;
          background: none;
          color: var(--secondary-text-color, #727272);
          cursor: pointer;
          font-size: 1em;
          line-height: 1;
          padding: 4px;
        }

        .legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 4px 12px;
          margin-top: 8px;
          font-size: 0.85em;
        }

        .legend-item {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .swatch {
          width: 12px;
          height: 12px;
          border-radius: 3px;
        }

        .swatch.no-rating {
          border: 1px solid var(--divider-color, #e0e0e0);
        }
      `,
    ];
  }

  getCardSize() {
    return 8;
  }
}

defineElement("sa-cfs-fire-danger-map-card", SaCfsFireDangerMapCard);
