// ==========================================================
// Contact form — client-side validation + submission
//
// This posts JSON to /api/contact. That endpoint does not exist yet —
// it needs to be a real backend (serverless function or small server)
// that validates the payload server-side, rate-limits by IP, and sends
// the message on via a transactional email provider (Resend, Postmark,
// SendGrid). See the project notes for the recommended setup. Until
// that endpoint exists, submissions will fail with a network error,
// which is caught below and turned into a friendly fallback pointing
// people at the direct email/phone links instead.
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("contactForm");
  const submitBtn = document.getElementById("submitBtn");
  const statusEl = document.getElementById("formStatus");
  if (!form) return;

  const CONTACT_ENDPOINT = "/api/contact";

  function setStatus(message, tone) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (tone ? ` form-status--${tone}` : "");
  }

  function fieldError(field, message) {
    const row = field.closest(".form-row") || field.parentElement;
    row.classList.add("has-error");
    let err = row.querySelector(".field-error");
    if (!err) {
      err = document.createElement("span");
      err.className = "field-error";
      field.insertAdjacentElement("afterend", err);
    }
    err.textContent = message;
  }

  function clearErrors() {
    form.querySelectorAll(".has-error").forEach((row) => row.classList.remove("has-error"));
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
  }

  function validate(data) {
    let valid = true;
    if (!data.fullName.trim()) {
      fieldError(form.fullName, "Please enter your name.");
      valid = false;
    }
    if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      fieldError(form.email, "Please enter a valid email address.");
      valid = false;
    }
    if (!data.projectType) {
      fieldError(form.projectType, "Please select a project type.");
      valid = false;
    }
    if (!data.message.trim()) {
      fieldError(form.message, "Tell us a little about the project.");
      valid = false;
    }
    return valid;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearErrors();
    setStatus("", null);

    const data = Object.fromEntries(new FormData(form).entries());
    if (!validate(data)) {
      setStatus("Please fix the highlighted fields.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    try {
      const res = await fetch(CONTACT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);

      form.reset();
      setStatus(
        "Thanks — your message is in. We'll get back to you within 1–2 business days.",
        "success"
      );
    } catch (err) {
      // No backend wired up yet — this is expected until /api/contact exists.
      setStatus(
        "We couldn't send that right now. Please email emrashotit@gmail.com directly in the meantime.",
        "error"
      );
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });
});
