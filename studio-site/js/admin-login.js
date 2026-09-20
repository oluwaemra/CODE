
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("adminLoginForm");
  const btn = document.getElementById("adminLoginBtn");
  const statusEl = document.getElementById("adminLoginStatus");
  if (!form) return;

  function setStatus(message, tone) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (tone ? ` form-status--${tone}` : "");
  }

  // Already signed in? Skip straight to the dashboard.
  fetch("/api/admin-session")
    .then((r) => r.json())
    .then((data) => {
      if (data.ok) window.location.href = "/admin/index.html";
    })
    .catch(() => {});

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", null);
    btn.disabled = true;
    btn.textContent = "Signing in…";

    try {
      const res = await fetch("/api/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.password.value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setStatus(data.error || "Sign-in failed.", "error");
        return;
      }
      window.location.href = "/admin/index.html";
    } catch {
      setStatus("Couldn't reach the server. Is the backend deployed?", "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });
});
