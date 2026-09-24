class TierPicker extends HTMLElement {
  connectedCallback() {
    this.inputs = Array.from(this.querySelectorAll('input[type="radio"]'));
    this.clearButton = this.querySelector("[data-clear-selection]");

    // No tier is pre-selected, so whatever quantity the theme's form starts
    // with is what "Remove bundle" should restore.
    this.originalQuantities = new Map(
      this.findQuantityInputs().map((input) => [input, input.value]),
    );

    this.inputs.forEach((input) => {
      input.addEventListener("change", () => this.handleSelectionChange());
    });
    this.clearButton?.addEventListener("click", () => this.clearSelection());
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

    this.findQuantityInputs().forEach((quantityInput) => {
      quantityInput.value = quantity;
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
      quantityInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  clearSelection() {
    this.inputs.forEach((input) => {
      input.checked = false;
      input.closest(".gw-tier-picker__option")?.classList.remove("is-selected");
    });
    if (this.clearButton) this.clearButton.hidden = true;

    this.originalQuantities.forEach((value, quantityInput) => {
      quantityInput.value = value;
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
      quantityInput.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  get selectedQuantity() {
    const checked = this.inputs.find((input) => input.checked);
    return checked ? Number(checked.value) : null;
  }
}

customElements.define("tier-picker", TierPicker);
