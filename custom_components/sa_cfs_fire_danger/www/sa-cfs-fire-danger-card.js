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
const ISSUED_ENTITY = "sensor.sa_cfs_fire_danger_issued";
const MAX_DAYS = 5;

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

  _schema() {
    return [
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
      { name: "show_fire_ban", selector: { boolean: {} } },
    ];
  }

  _computeLabel(schema) {
    return {
      title: "Title",
      entities: "Districts (leave empty for all)",
      days: "Days to show",
      show_fbi: "Show fire behaviour index",
      show_fire_ban: "Show total fire bans",
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
        .data=${{ days: 4, show_fbi: true, show_fire_ban: true, ...this._config }}
        .schema=${this._schema()}
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
    return { title: "SA CFS Fire Danger Ratings", days: 4 };
  }

  setConfig(config) {
    const days = Number(config.days ?? 4);
    if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
      throw new Error(`days must be between 1 and ${MAX_DAYS}`);
    }
    if (config.entities && !Array.isArray(config.entities)) {
      throw new Error("entities must be a list");
    }
    this.config = { show_fbi: true, show_fire_ban: true, ...config, days };
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
    const issued = this.hass.states[ISSUED_ENTITY];
    const headings = [];
    for (let day = 1; day <= this.config.days; day++) {
      let label;
      if (day === 1) label = "Today";
      else if (day === 2) label = "Tomorrow";
      else if (issued?.attributes[`day_${day}_name`]) {
        label = issued.attributes[`day_${day}_name`].slice(0, 3);
      } else {
        label = `Day ${day}`;
      }
      const date = issued?.attributes[`day_${day}_date`];
      headings.push({ label, date });
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

  _renderCell(attrs, day) {
    const rating = attrs[`day_${day}_rating`];
    const fbi = attrs[`day_${day}_fbi`];
    const fireBan = attrs[`day_${day}_fire_ban`] === true;

    if (rating === null || rating === undefined) {
      return html`<td class="cell empty">–</td>`;
    }

    const style = RATING_STYLES[rating] || RATING_STYLES["No Rating"];
    return html`
      <td class="cell">
        <div
          class="rating ${rating === "No Rating" ? "no-rating" : ""}"
          style="background:${style.background};color:${style.color}"
        >
          ${rating}
        </div>
        ${this.config.show_fbi && fbi !== null && fbi !== undefined
          ? html`<div class="fbi" title="Fire behaviour index">FBI ${fbi}</div>`
          : ""}
        ${this.config.show_fire_ban && fireBan
          ? html`<div class="fire-ban">TOTAL FIRE BAN</div>`
          : ""}
      </td>
    `;
  }

  _renderIssued() {
    const issued = this.hass.states[ISSUED_ENTITY];
    if (!issued || !issued.state || ["unknown", "unavailable"].includes(issued.state)) {
      return "";
    }
    const when = new Date(issued.state);
    if (isNaN(when)) return "";
    const formatted = when.toLocaleString(this.hass.locale?.language || undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: this.hass.config?.time_zone || undefined,
    });
    return html`<div class="issued">Issued ${formatted}</div>`;
  }

  render() {
    if (!this.hass || !this.config) return html``;

    const entityIds = this._entityIds();
    const headings = this._headings();

    return html`
      <ha-card .header=${this.config.title}>
        <div class="card-content">
          ${entityIds.length === 0
            ? html`<div class="none">
                No SA CFS district sensors found. Select districts in the integration options.
              </div>`
            : html`
                <div class="scroll">
                  <table>
                    <thead>
                      <tr>
                        <th class="district">District</th>
                        ${headings.map(
                          (h) => html`<th>
                            <div>${h.label}</div>
                            ${h.date ? html`<div class="date">${h.date}</div>` : ""}
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
                </div>
              `}
          ${this._renderIssued()}
        </div>
      </ha-card>
    `;
  }

  static get styles() {
    return css`
      .scroll {
        overflow-x: auto;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th {
        font-weight: 500;
        padding: 4px;
        text-align: center;
        white-space: nowrap;
      }

      th .date {
        font-size: 0.8em;
        font-weight: 400;
        color: var(--secondary-text-color);
      }

      td {
        padding: 4px;
        border-top: 1px solid var(--divider-color);
      }

      .district {
        text-align: left;
      }

      td.district {
        cursor: pointer;
        font-weight: 500;
      }

      .cell {
        text-align: center;
        vertical-align: top;
        min-width: 84px;
      }

      .cell.empty {
        color: var(--secondary-text-color);
        vertical-align: middle;
      }

      .rating {
        border-radius: 4px;
        padding: 2px 4px;
        font-weight: 500;
        white-space: nowrap;
      }

      .rating.no-rating {
        border: 1px solid var(--divider-color);
      }

      .fbi {
        font-size: 0.8em;
        color: var(--secondary-text-color);
        margin-top: 2px;
      }

      .fire-ban {
        background: #ff0000;
        color: #ffffff;
        border-radius: 4px;
        font-size: 0.75em;
        font-weight: 700;
        margin-top: 2px;
        padding: 1px 2px;
        white-space: nowrap;
      }

      .issued {
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
