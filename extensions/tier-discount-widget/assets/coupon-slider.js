class CouponSlider extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector(".gw-coupon-slider__track");
    this.cards = Array.from(this.querySelectorAll(".gw-coupon-slider__card"));
    this.prevButton = this.querySelector("[data-prev]");
    this.nextButton = this.querySelector("[data-next]");
    this.dotsContainer = this.querySelector("[data-dots]");
    this.index = 0;

    this.buildDots();
    this.updateSlide();

    this.prevButton?.addEventListener("click", () => this.go(this.index - 1));
    this.nextButton?.addEventListener("click", () => this.go(this.index + 1));

    this.querySelectorAll("[data-copy-code]").forEach((button) => {
      button.addEventListener("click", () => this.copyCode(button));
    });
  }

  buildDots() {
    if (!this.dotsContainer) return;
    this.dots = this.cards.map((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "gw-coupon-slider__dot";
      dot.setAttribute("aria-label", `Go to coupon ${i + 1}`);
      dot.addEventListener("click", () => this.go(i));
      this.dotsContainer.appendChild(dot);
      return dot;
    });
  }

  go(nextIndex) {
    const max = this.cards.length - 1;
    this.index = Math.max(0, Math.min(nextIndex, max));
    this.updateSlide();
  }

  updateSlide() {
    if (this.track) {
      this.track.style.transform = `translateX(-${this.index * 100}%)`;
    }
    if (this.prevButton) this.prevButton.disabled = this.index === 0;
    if (this.nextButton) {
      this.nextButton.disabled = this.index === this.cards.length - 1;
    }
    this.dots?.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === this.index);
    });
  }

  async copyCode(button) {
    const code = button.dataset.copyCode;
    const label = button.querySelector("[data-copy-label]");
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    button.classList.add("is-copied");
    if (label) label.textContent = "Copied!";

    document.dispatchEvent(
      new CustomEvent("gw:coupon-copied", { bubbles: true, detail: { code } }),
    );

    setTimeout(() => {
      button.classList.remove("is-copied");
      if (label) label.textContent = "Copy";
    }, 1500);
  }
}

customElements.define("coupon-slider", CouponSlider);
