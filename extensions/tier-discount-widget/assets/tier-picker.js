class TierPicker extends HTMLElement {
  connectedCallback() {
    this.inputs = Array.from(this.querySelectorAll('input[type="radio"]'));
    this.submitButton = this.querySelector("[data-add-to-cart]");
    this.status = this.querySelector("[data-status]");
    this.variantId = this.dataset.variantId;

    this.inputs.forEach((input) => {
      input.addEventListener("change", () => this.handleSelectionChange());
    });

    this.submitButton?.addEventListener("click", () => this.addToCart());
  }

  handleSelectionChange() {
    this.inputs.forEach((input) => {
      input.closest(".gw-tier-picker__option")?.classList.toggle(
        "is-selected",
        input.checked,
      );
    });
  }

  get selectedQuantity() {
    const checked = this.inputs.find((input) => input.checked);
    return checked ? Number(checked.value) : null;
  }

  async addToCart() {
    const quantity = this.selectedQuantity;
    if (!this.variantId || !quantity) return;

    this.submitButton.disabled = true;
    this.setStatus("Adding…");

    try {
      const response = await fetch(window.Shopify?.routes?.root
        ? `${window.Shopify.routes.root}cart/add.js`
        : "/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          items: [{ id: Number(this.variantId), quantity }],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.description || "Could not add to cart.");
      }

      this.setStatus(`Added ${quantity} to cart.`);
      document.dispatchEvent(
        new CustomEvent("cart:updated", { bubbles: true }),
      );
      document.dispatchEvent(
        new CustomEvent("gw:tier-added-to-cart", {
          bubbles: true,
          detail: { variantId: this.variantId, quantity },
        }),
      );
    } catch (error) {
      this.setStatus(error.message || "Something went wrong.");
    } finally {
      this.submitButton.disabled = false;
    }
  }

  setStatus(message) {
    if (this.status) this.status.textContent = message;
  }
}

customElements.define("tier-picker", TierPicker);
