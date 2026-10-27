const $ = (id) => document.getElementById(id);
let lastPositions = [];

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function renderStats(data) {
  $("stat-inserted").textContent = Number(data.inserted_count || 0).toLocaleString();
  $("stat-checks").textContent = Number(data.checks_count || 0).toLocaleString();
  $("stat-size").textContent = Number(data.filter_size_bits || 0).toLocaleString();
  $("stat-fpr").textContent = Number(data.estimated_false_positive_rate || 0).toFixed(3);
}

function renderBits(bits, highlight = []) {
  const grid = $("bit-array");
  grid.innerHTML = "";
  bits.slice(0, 80).forEach((value, index) => {
    const bit = document.createElement("div");
    bit.className = `bit ${value ? "on" : ""} ${highlight.includes(index) ? "highlight" : ""}`;
    bit.textContent = value;
    bit.title = `Bit ${index}: ${value}`;
    grid.appendChild(bit);
  });
}

async function refreshStats(highlight = []) {
  const data = await api("/api/stats");
  renderStats(data);
  renderBits(data.bit_array, highlight);
}

function renderResult(targetId, data) {
  const box = $(targetId);
  const present = data.result === "PROBABLY_PRESENT";
  box.className = `result-box ${present ? "present" : "absent"}`;
  box.innerHTML = `
    <span class="result-icon">${present ? "≈" : "✓"}</span>
    <div>
      <strong>${present ? "Probably present" : "Definitely not present"}</strong>
      <p>${escapeHtml(data.explanation)}<br><br>
      <b>Element:</b> ${escapeHtml(data.element)} &nbsp;·&nbsp;
      <b>Check time:</b> ${Number(data.time_ms).toFixed(4)} ms</p>
      <div class="position-list">${data.positions.map((p) => `<span class="position-chip">Bit ${p}</span>`).join("")}</div>
    </div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

async function checkElement(inputId, resultId) {
  const element = $(inputId).value.trim();
  if (!element) {
    showToast("Enter an element to check first.");
    $(inputId).focus();
    return;
  }
  try {
    const data = await api("/api/check", {
      method: "POST",
      body: JSON.stringify({ element })
    });
    renderResult(resultId, data);
    lastPositions = data.positions;
    // Highlight only the displayed part of the bit array.
    await refreshStats(data.positions.filter((p) => p < 80));
  } catch (error) {
    showToast(error.message);
  }
}

$("check-form").addEventListener("submit", (event) => {
  event.preventDefault();
  checkElement("check-input", "check-result");
});
$("check-form-full").addEventListener("submit", (event) => {
  event.preventDefault();
  checkElement("check-input-full", "check-result-full");
});

$("insert-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const element = $("insert-input").value.trim();
  if (!element) return showToast("Enter an element to insert.");
  try {
    const data = await api("/api/insert", {
      method: "POST",
      body: JSON.stringify({ element })
    });
    $("insert-message").className = "message-box";
    $("insert-message").textContent = `Inserted "${element}" · ${data.positions.length} hash positions · ${data.time_ms} ms`;
    $("insert-message").classList.remove("hidden");
    $("insert-input").value = "";
    await refreshStats(data.positions.filter((p) => p < 80));
    showToast("Element inserted successfully.");
  } catch (error) {
    $("insert-message").className = "message-box error";
    $("insert-message").textContent = error.message;
    $("insert-message").classList.remove("hidden");
  }
});

$("bulk-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const elements = $("bulk-input").value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (!elements.length) return showToast("Enter one or more elements.");
  try {
    const data = await api("/api/bulk-insert", {
      method: "POST",
      body: JSON.stringify({ elements })
    });
    $("bulk-message").className = "message-box";
    $("bulk-message").textContent = `Inserted ${data.inserted_now} elements in ${data.time_ms} ms.`;
    $("bulk-message").classList.remove("hidden");
    $("bulk-input").value = "";
    await refreshStats();
    showToast("Bulk insertion complete.");
  } catch (error) {
    $("bulk-message").className = "message-box error";
    $("bulk-message").textContent = error.message;
    $("bulk-message").classList.remove("hidden");
  }
});

$("reset-btn").addEventListener("click", async () => {
  if (!confirm("Reset the filter and remove all currently inserted values?")) return;
  try {
    await api("/api/reset", { method: "POST", body: JSON.stringify({}) });
    $("insert-message").classList.add("hidden");
    $("bulk-message").classList.add("hidden");
    await refreshStats();
    showToast("Bloom Filter reset.");
  } catch (error) {
    showToast(error.message);
  }
});

function showPage(target) {
  document.querySelectorAll(".page-section").forEach((section) => {
    section.classList.toggle("hidden", section.id !== target);
  });
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.target === target);
  });
  const titles = {
    dashboard: "Membership intelligence",
    checker: "Membership check",
    dataset: "Manage dataset",
    explainer: "How BloomCheck works"
  };
  $("page-title").textContent = titles[target] || titles.dashboard;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.target));
});
document.querySelectorAll("[data-go]").forEach((button) => {
  button.addEventListener("click", () => showPage(button.dataset.go));
});

refreshStats().catch((error) => showToast(error.message));
