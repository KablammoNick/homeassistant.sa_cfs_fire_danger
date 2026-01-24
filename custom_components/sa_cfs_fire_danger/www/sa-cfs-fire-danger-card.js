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
      .filter((e) => e.startsWith("sensor.sa_cfs_"))
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
      overlay_fire_ban && state.attributes?.day_1_fireban === "Yes"
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
