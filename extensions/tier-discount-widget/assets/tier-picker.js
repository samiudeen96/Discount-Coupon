class TierPicker extends HTMLElement {
  connectedCallback() {
    this.inputs = Array.from(this.querySelectorAll('input[type="radio"]'));
    this.clearButton = this.querySelector("[data-clear-selection]");
    this.suppressExternalSync = false;

    // No tier is pre-selected, so whatever quantity the theme's form starts
    // with is what "Remove bundle" should restore.
    this.quantityInputs = this.findQuantityInputs();
    this.originalQuantities = new Map(
      this.quantityInputs.map((input) => [input, input.value]),
    );

    this.inputs.forEach((input) => {
      input.addEventListener("change", () => this.handleSelectionChange());
    });
    this.clearButton?.addEventListener("click", () => this.clearSelection());

    // Two-way sync: the theme's own native quantity +/- steppers (or typing
    // a quantity directly) should also select the matching tier, not just
    // the other way around.
    this.quantityInputs.forEach((input) => {
      const handler = () => this.handleQuantityInputChange(input);
      input.addEventListener("input", handler);
      input.addEventListener("change", handler);
    });

    // Some themes' quantity steppers update the input's value via a custom
    // element/JS property write without ever dispatching input/change
    // events, so the listeners above silently miss it. A light poll makes
    // the sync work regardless of how the theme's buttons are implemented.
    this.lastKnownQuantities = new Map(
      this.quantityInputs.map((input) => [input, input.value]),
    );
    this.pollTimer = window.setInterval(() => this.pollQuantityInputs(), 300);
  }

  disconnectedCallback() {
    if (this.pollTimer) window.clearInterval(this.pollTimer);
  }

  pollQuantityInputs() {
    if (this.suppressExternalSync) return;
    this.quantityInputs.forEach((input) => {
      if (input.value !== this.lastKnownQuantities.get(input)) {
        this.lastKnownQuantities.set(input, input.value);
        this.handleQuantityInputChange(input);
      }
    });
  }

  // A theme page can have more than one product form for the same product
  // (a main "buy box" plus a sticky/duplicate add-to-cart bar), each with
  // its own quantity input. Update all of them so whichever button the
  // shopper clicks submits the tier's quantity.
  findQuantityInputs() {
    const ownForm = this.closest('form[action*="/cart/add"]');
    const forms = new Set(document.querySelectorAll('form[action*="/cart/add"]'));
    if (ownForm) forms.add(ownForm);

    const inputs = new Set();
    forms.forEach((form) => {
      const input = form.querySelector('input[name="quantity"]');
      if (input) inputs.add(input);
    });
    return Array.from(inputs);
  }

  handleSelectionChange() {
    this.inputs.forEach((input) => {
      input.closest(".gw-tier-picker__option")?.classList.toggle(
        "is-selected",
        input.checked,
      );
    });

    const quantity = this.selectedQuantity;
    if (this.clearButton) this.clearButton.hidden = !quantity;
    if (!quantity) return;

    // Suppress our own quantity-input listener while we write these values,
    // otherwise it would immediately try to re-derive (and possibly change)
    // the tier selection from the value we just set.
    this.suppressExternalSync = true;
    this.findQuantityInputs().forEach((quantityInput) => {
      quantityInput.value = quantity;
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
      quantityInput.dispatchEvent(new Event("change", { bubbles: true }));
      this.lastKnownQuantities?.set(quantityInput, quantityInput.value);
    });
    this.suppressExternalSync = false;
  }

  handleQuantityInputChange(sourceInput) {
    if (this.suppressExternalSync) return;

    const quantity = Number(sourceInput.value || 0);
    if (!quantity) return;

    const match = this.findMatchingRadio(quantity);
    if (match) {
      if (!match.checked) {
        match.checked = true;
        this.handleSelectionChange();
      }
    } else if (this.selectedQuantity) {
      // The new quantity doesn't fall in any tier's range anymore (e.g.
      // typed below the smallest "from") — drop the now-stale selection.
      this.inputs.forEach((input) => {
        input.checked = false;
        input
          .closest(".gw-tier-picker__option")
          ?.classList.remove("is-selected");
      });
      if (this.clearButton) this.clearButton.hidden = true;
    }
  }

  findMatchingRadio(quantity) {
    let best = null;
    let bestFrom = -Infinity;
    this.inputs.forEach((input) => {
      const from = Number(input.value);
      const to = input.dataset.max ? Number(input.dataset.max) : Infinity;
      if (quantity >= from && quantity <= to && from > bestFrom) {
        best = input;
        bestFrom = from;
      }
    });
    return best;
  }

  clearSelection() {
    this.inputs.forEach((input) => {
      input.checked = false;
      input.closest(".gw-tier-picker__option")?.classList.remove("is-selected");
    });
    if (this.clearButton) this.clearButton.hidden = true;

    this.suppressExternalSync = true;
    this.originalQuantities.forEach((value, quantityInput) => {
      quantityInput.value = value;
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
      quantityInput.dispatchEvent(new Event("change", { bubbles: true }));
      this.lastKnownQuantities?.set(quantityInput, quantityInput.value);
    });
    this.suppressExternalSync = false;
  }

  get selectedQuantity() {
    const checked = this.inputs.find((input) => input.checked);
    return checked ? Number(checked.value) : null;
  }
}

customElements.define("tier-picker", TierPicker);
