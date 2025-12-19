// app.js
// SPA de encomendas (MVP) - sem role e sem users.
// Usuários são cadastrados manualmente no Firebase Auth.

import { auth, db, fs, fa } from "./firebase.js";

/* =========================
   ESTADO
========================= */
const state = {
  user: null,
  cacheClients: [],
  cacheOrdersRange: [],
  calendar: {
    year: null,
    month: null,      // 0-11
    maxIndicators: 4  // X encomendas num dia -> mostra contador
  }
};

/* =========================
   HELPERS UI
========================= */
const $ = (sel) => document.querySelector(sel);

const views = {
  login: $("#view-login"),
  dashboard: $("#view-dashboard"),
  calendar: $("#view-calendar"),
  orders: $("#view-orders"),
  orderForm: $("#view-order-form"),
  clients: $("#view-clients")
};

const helloUser = $("#helloUser");
const btnLogout = $("#btnLogout");
const sidebar = $("#sidebar");

const pillStatus = $("#pillStatus");

const toast = $("#toast");
const toastMsg = $("#toastMsg");
$("#toastClose").addEventListener("click", () => (toast.hidden = true));

function showToast(msg) {
  toastMsg.textContent = msg;
  toast.hidden = false;
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => (toast.hidden = true), 4500);
}

function setOnlineBadge() {
  const ok = navigator.onLine;
  pillStatus.textContent = ok ? "online" : "sem internet";
  pillStatus.style.borderColor = ok ? "rgba(57,217,138,.35)" : "rgba(255,91,107,.35)";
  pillStatus.style.color = ok ? "#b9ffe0" : "#ffb6bf";
}
window.addEventListener("online", setOnlineBadge);
window.addEventListener("offline", setOnlineBadge);

/* =========================
   SPA ROUTER
========================= */
function showView(name) {
  Object.values(views).forEach(v => v.hidden = true);
  views[name].hidden = false;

  document.querySelectorAll(".nav-item").forEach(b => {
    const route = b.getAttribute("data-route");
    b.style.borderColor = (route && routeMatchesView(route, name))
      ? "rgba(110,231,255,.35)"
      : "rgba(255,255,255,.08)";
  });
}

function routeMatchesView(route, viewName) {
  if (route === "dashboard" && viewName === "dashboard") return true;
  if (route === "calendar" && viewName === "calendar") return true;
  if (route === "orders" && viewName === "orders") return true;
  if (route === "clients" && viewName === "clients") return true;
  if (route === "order-new" && viewName === "orderForm") return true;
  return false;
}

function goto(route, params = {}) {
  const q = new URLSearchParams(params).toString();
  location.hash = q ? `#${route}?${q}` : `#${route}`;
}

function getRouteFromHash() {
  const h = (location.hash || "#login").slice(1);
  const [route, qs] = h.split("?");
  const params = Object.fromEntries(new URLSearchParams(qs || ""));
  return { route: route || "login", params };
}

window.addEventListener("hashchange", handleRoute);

async function handleRoute() {
  const { route, params } = getRouteFromHash();

  if (!state.user && route !== "login") {
    showView("login");
    return;
  }

  if (route === "login") {
    showView("login");
    return;
  }

  if (route === "dashboard") {
    showView("dashboard");
    await loadDashboard();
    return;
  }

  if (route === "calendar") {
    showView("calendar");
    await loadCalendarMonth(state.calendar.year, state.calendar.month);
    return;
  }

  if (route === "orders") {
    showView("orders");
    await loadOrdersList();
    return;
  }

  if (route === "clients") {
    showView("clients");
    await loadClients();
    return;
  }

  if (route === "order-new") {
    showView("orderForm");
    await openOrderForm(null);
    return;
  }

  if (route === "order-edit") {
    showView("orderForm");
    await openOrderForm(params.id || null);
    return;
  }

  showView("dashboard");
}

/* =========================
   FORMATAÇÃO PT-BR
========================= */
function formatDateTimePtBR(dateObj) {
  const d = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric"
  }).format(dateObj);

  const t = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit", minute: "2-digit"
  }).format(dateObj);

  return { d, t };
}

function formatMoneyBRL(valueNumber) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valueNumber || 0);
}

function parsePtBRNumberToFloat(str) {
  if (typeof str !== "string") return 0;
  const s = str.trim();
  if (!s) return 0;

  const cleaned = s.replace(/[R$\s]/g, "");

  if (cleaned.includes(",")) {
    const noThousands = cleaned.replace(/\./g, "");
    const normalized = noThousands.replace(",", ".");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function startOfDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
function endOfDay(date = new Date()) { const d = new Date(date); d.setHours(23,59,59,999); return d; }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate() + days); return d; }
function startOfMonth(date = new Date()) { const d = new Date(date.getFullYear(), date.getMonth(), 1); d.setHours(0,0,0,0); return d; }
function endOfMonth(date = new Date()) { const d = new Date(date.getFullYear(), date.getMonth() + 1, 0); d.setHours(23,59,59,999); return d; }

/* =========================
   AUTH
========================= */
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const pass = $("#loginPassword").value;

  try {
    await fa.signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    showToast(prettyAuthError(err));
  }
});

btnLogout.addEventListener("click", async () => {
  try {
    await fa.signOut(auth);
  } catch {
    showToast("Não foi possível sair. Tente novamente.");
  }
});

function prettyAuthError(err) {
  const code = err?.code || "";
  if (code.includes("auth/invalid-credential")) return "E-mail ou senha inválidos.";
  if (code.includes("auth/wrong-password")) return "Senha incorreta.";
  if (code.includes("auth/user-not-found")) return "Usuário não encontrado.";
  if (code.includes("auth/invalid-email")) return "E-mail inválido.";
  if (!navigator.onLine) return "Sem internet. Verifique sua conexão.";
  return "Erro de autenticação. Tente novamente.";
}

function applyUserUI() {
  const name = state.user?.displayName || state.user?.email || "—";
  helloUser.textContent = `Olá, ${name}`;
  btnLogout.hidden = false;
  sidebar.hidden = false;
}

/* =========================
   FIRESTORE (SEM ROLE)
   - Cada usuário vê apenas encomendas criadas por ele
========================= */
function ordersBaseConstraints(qParts) {
  qParts.push(fs.where("criadoPor", "==", state.user.uid));
}

async function fetchOrdersByRange(dateStart, dateEnd) {
  const qParts = [
    fs.collection(db, "orders"),
    fs.where("dataHoraTimestamp", ">=", fs.Timestamp.fromDate(dateStart)),
    fs.where("dataHoraTimestamp", "<=", fs.Timestamp.fromDate(dateEnd)),
    fs.orderBy("dataHoraTimestamp", "asc"),
    fs.limit(400)
  ];
  ordersBaseConstraints(qParts);

  const q = fs.query(...qParts);
  const snap = await fs.getDocs(q);
  const list = [];
  snap.forEach(docu => list.push({ id: docu.id, ...docu.data() }));
  return list;
}

async function fetchOrderById(id) {
  const ref = fs.doc(db, "orders", id);
  const snap = await fs.getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  // segurança extra no cliente (Rules já fazem o principal)
  if (data?.criadoPor && data.criadoPor !== state.user.uid) return null;
  return { id: snap.id, ...data };
}

/* =========================
   NAV
========================= */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    const r = btn.getAttribute("data-route");
    if (r === "order-new") goto("order-new");
    else goto(r);
  });
});
$("#btnBackFromForm").addEventListener("click", () => goto("orders"));

/* =========================
   DASHBOARD
========================= */
$("#btnRefreshDash").addEventListener("click", loadDashboard);
$("#dashFilter").addEventListener("change", loadDashboard);
$("#quickSearch").addEventListener("input", renderDashboardLists);

async function loadDashboard() {
  try {
    setOnlineBadge();

    const filter = $("#dashFilter").value;
    const now = new Date();

    let start = startOfDay(now);
    let end = endOfDay(addDays(now, 6));

    if (filter === "today") {
      start = startOfDay(now);
      end = endOfDay(now);
    } else if (filter === "month") {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }

    const orders = await fetchOrdersByRange(start, end);
    state.cacheOrdersRange = orders;
    renderDashboardLists();
  } catch (err) {
    showToast(prettyFsError(err));
  }
}

function renderDashboardLists() {
  const q = ($("#quickSearch").value || "").trim().toLowerCase();

  const now = new Date();
  const start7 = startOfDay(now);
  const end7 = endOfDay(addDays(now, 6));

  const upcoming = state.cacheOrdersRange
    .filter(o => {
      const dt = o.dataHoraTimestamp?.toDate?.() ? o.dataHoraTimestamp.toDate() : null;
      return dt && dt >= start7 && dt <= end7;
    })
    .filter(o => matchSearch(o, q))
    .sort((a,b) => a.dataHoraTimestamp.toDate() - b.dataHoraTimestamp.toDate());

  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const today = state.cacheOrdersRange
    .filter(o => {
      const dt = o.dataHoraTimestamp?.toDate?.() ? o.dataHoraTimestamp.toDate() : null;
      return dt && dt >= todayStart && dt <= todayEnd;
    })
    .filter(o => matchSearch(o, q))
    .sort((a,b) => a.dataHoraTimestamp.toDate() - b.dataHoraTimestamp.toDate());

  $("#listUpcoming").innerHTML = upcoming.length
    ? upcoming.map(o => orderCardHTML(o, { mode: "upcoming" })).join("")
    : emptyHTML("Nenhuma encomenda no período.");

  $("#listToday").innerHTML = today.length
    ? today.map(o => orderCardHTML(o, { mode: "today" })).join("")
    : emptyHTML("Nenhuma encomenda para hoje.");

  wireOrderCardButtons($("#listUpcoming"));
  wireOrderCardButtons($("#listToday"));
}

/* =========================
   ENCOMENDAS (LISTA)
========================= */
$("#btnLoadOrders").addEventListener("click", loadOrdersList);
$("#ordersFilter").addEventListener("change", loadOrdersList);
$("#ordersSearch").addEventListener("input", renderOrdersList);

async function loadOrdersList() {
  try {
    setOnlineBadge();

    const filter = $("#ordersFilter").value;
    const now = new Date();

    let start = startOfDay(now);
    let end = endOfDay(addDays(now, 6));

    if (filter === "today") {
      start = startOfDay(now);
      end = endOfDay(now);
    } else if (filter === "month") {
      start = startOfMonth(now);
      end = endOfMonth(now);
    }

    const orders = await fetchOrdersByRange(start, end);
    state.cacheOrdersRange = orders;
    renderOrdersList();
  } catch (err) {
    showToast(prettyFsError(err));
  }
}

function renderOrdersList() {
  const q = ($("#ordersSearch").value || "").trim().toLowerCase();

  const list = state.cacheOrdersRange
    .filter(o => matchSearch(o, q))
    .sort((a,b) => a.dataHoraTimestamp.toDate() - b.dataHoraTimestamp.toDate());

  $("#ordersList").innerHTML = list.length
    ? list.map(o => orderCardHTML(o, { mode: "list" })).join("")
    : emptyHTML("Nenhuma encomenda encontrada.");

  wireOrderCardButtons($("#ordersList"));
}

function matchSearch(order, q) {
  if (!q) return true;
  const nome = (order.clientNomeSnapshot || "").toLowerCase();
  const tel = (order.telefoneSnapshot || "").toLowerCase();
  return nome.includes(q) || tel.includes(q);
}

/* =========================
   CARDS + AÇÕES (inclui Confirmação)
========================= */
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emptyHTML(msg) {
  return `<div class="list-item"><div class="muted">${escapeHtml(msg)}</div></div>`;
}

function statusBadgeClass(status) {
  if (status === "Entregue/Retirado") return "ok";
  if (status === "Cancelado") return "danger";
  if (status === "Pronto") return "warn";
  return "info";
}

function orderCardHTML(o, { mode }) {
  const dt = o.dataHoraTimestamp?.toDate?.() ? o.dataHoraTimestamp.toDate() : new Date();
  const { d, t } = formatDateTimePtBR(dt);
  const total = formatMoneyBRL(o.valorTotal || 0);

  const badgeStatus = `<span class="badge ${statusBadgeClass(o.status)}">${escapeHtml(o.status || "—")}</span>`;
  const badgeType = `<span class="badge">${escapeHtml(o.tipo || "—")}</span>`;

  const btnDetails = `<button class="btn small btn-ghost" data-action="details" data-id="${o.id}">Ver detalhes</button>`;
  const btnReceipt = `<button class="btn small btn-ghost" data-action="receipt" data-id="${o.id}">Confirmação</button>`;
  const btnEdit = `<button class="btn small btn-primary" data-action="edit" data-id="${o.id}">Editar</button>`;

  const quick = (mode === "today") ? `
    <button class="btn small btn-secondary" data-action="status" data-status="Pronto" data-id="${o.id}">Marcar como pronto</button>
    <button class="btn small btn-secondary" data-action="status" data-status="Entregue/Retirado" data-id="${o.id}">Despachado/Retirado</button>
    <button class="btn small btn-danger" data-action="status" data-status="Cancelado" data-id="${o.id}">Cancelado</button>
  ` : "";

  return `
    <div class="list-item">
      <div>
        <strong>${escapeHtml(o.clientNomeSnapshot || "Cliente")}</strong>
        <div class="badges">${badgeStatus}</div>
      </div>

      <div class="row">
        <div><strong>${escapeHtml(d)}</strong> às <strong>${escapeHtml(t)}</strong></div>
        <div>• ${badgeType}</div>
        <div>• ${escapeHtml(total)}</div>
        <div>• ${escapeHtml(o.telefoneSnapshot || "—")}</div>
      </div>

      <div class="item-actions">
        ${btnDetails}
        ${btnReceipt}
        ${btnEdit}
        ${quick}
      </div>
    </div>
  `;
}

function wireOrderCardButtons(container) {
  container.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;

      if (action === "edit") { goto("order-edit", { id }); return; }

      if (action === "details") {
        const order = await fetchOrderById(id);
        if (!order) return showToast("Encomenda não encontrada.");
        showToast(formatOrderDetails(order));
        return;
      }

      if (action === "receipt") {
        const order = await fetchOrderById(id);
        if (!order) return showToast("Encomenda não encontrada.");
        openReceipt(order);
        return;
      }

      if (action === "status") {
        const status = btn.dataset.status;
        await quickUpdateStatus(id, status);
        await refreshCurrentViewOrders();
        return;
      }
    });
  });
}

function formatOrderDetails(o) {
  const dt = o.dataHoraTimestamp?.toDate?.() ? o.dataHoraTimestamp.toDate() : new Date();
  const { d, t } = formatDateTimePtBR(dt);
  const itens = Array.isArray(o.itens) ? o.itens : [];
  const itensTxt = itens.length ? itens.map(i => `${i.nome} (${i.qtd})`).join(", ") : "—";
  return `#${o.id} • ${d} ${t} • ${o.clientNomeSnapshot || "Cliente"} • ${o.tipo || "—"} • ${formatMoneyBRL(o.valorTotal || 0)} • ${o.status || "—"} • Itens: ${itensTxt}`;
}

async function quickUpdateStatus(orderId, status) {
  try {
    const ref = fs.doc(db, "orders", orderId);
    await fs.updateDoc(ref, { status, atualizadoEm: fs.serverTimestamp() });
    showToast(`Status atualizado: ${status}`);
  } catch (err) {
    showToast(prettyFsError(err));
  }
}

async function refreshCurrentViewOrders() {
  const { route } = getRouteFromHash();
  if (route === "dashboard") await loadDashboard();
  if (route === "orders") await loadOrdersList();
  if (route === "calendar") await loadCalendarMonth(state.calendar.year, state.calendar.month);
}

/* =========================
   FORM ENCOMENDA (CRUD)
========================= */
const itemsContainer = $("#itemsContainer");

$("#btnAddItem").addEventListener("click", () => addItemRow());

$("#orderForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  try {
    const dtValue = $("#orderDateTime").value;
    if (!dtValue) return showToast("Informe data e hora.");
    const dt = new Date(dtValue);
    if (Number.isNaN(dt.getTime())) return showToast("Data/hora inválida.");

    const tipo = $("#orderType").value;
    const clientId = $("#orderClient").value;
    if (!clientId) return showToast("Selecione um cliente.");

    const telefone = $("#orderPhone").value.trim();
    if (!telefone) return showToast("WhatsApp (telefone) é obrigatório.");

    const valorTotal = parsePtBRNumberToFloat($("#orderTotal").value);
    if (valorTotal <= 0) return showToast("Valor total deve ser maior que zero.");

    const status = $("#orderStatus").value;
    const observacoes = $("#orderNotes").value.trim();
    const pagamento = $("#orderPayment").value.trim();
    const sinal = parsePtBRNumberToFloat($("#orderDeposit").value);

    const itens = collectItems();
    if (!itens.length) return showToast("Adicione pelo menos 1 item.");

    const client = state.cacheClients.find(c => c.id === clientId);
    if (!client) return showToast("Cliente inválido (recarregue a lista).");

    const payloadBase = {
      clientId,
      clientNomeSnapshot: client.nome || "",
      telefoneSnapshot: telefone || client.telefone || "",
      dataHoraTimestamp: fs.Timestamp.fromDate(dt),
      tipo,
      itens,
      valorTotal,
      status,
      observacoes,
      formaPagamento: pagamento || null,
      sinalEntrada: sinal > 0 ? sinal : null,
      atualizadoEm: fs.serverTimestamp()
    };

    const id = $("#orderId").value;

    if (!id) {
      await fs.addDoc(fs.collection(db, "orders"), {
        ...payloadBase,
        criadoPor: state.user.uid,
        criadoEm: fs.serverTimestamp()
      });
      showToast("Encomenda criada.");
    } else {
      const ref = fs.doc(db, "orders", id);
      await fs.updateDoc(ref, payloadBase);
      showToast("Encomenda atualizada.");
    }

    goto("orders");
  } catch (err) {
    showToast(prettyFsError(err));
  }
});

$("#btnDeleteOrder").addEventListener("click", async () => {
  const id = $("#orderId").value;
  if (!id) return;

  const ok = confirm("Excluir esta encomenda? Essa ação não pode ser desfeita.");
  if (!ok) return;

  try {
    await fs.deleteDoc(fs.doc(db, "orders", id));
    showToast("Encomenda excluída.");
    goto("orders");
  } catch (err) {
    showToast(prettyFsError(err));
  }
});

async function openOrderForm(orderIdOrNull) {
  await loadClients();

  $("#orderForm").reset();
  $("#orderId").value = "";
  itemsContainer.innerHTML = "";
  $("#btnDeleteOrder").hidden = true;

  addItemRow();

  if (!orderIdOrNull) {
    $("#orderFormTitle").textContent = "Nova encomenda";
    const dt = new Date();
    dt.setMinutes(0,0,0);
    dt.setHours(dt.getHours() + 1);
    $("#orderDateTime").value = toDateTimeLocalValue(dt);
    return;
  }

  $("#orderFormTitle").textContent = "Editar encomenda";
  const o = await fetchOrderById(orderIdOrNull);

  if (!o) {
    showToast("Encomenda não encontrada.");
    goto("orders");
    return;
  }

  $("#orderId").value = o.id;
  $("#btnDeleteOrder").hidden = false;

  const dt = o.dataHoraTimestamp?.toDate?.() ? o.dataHoraTimestamp.toDate() : new Date();
  $("#orderDateTime").value = toDateTimeLocalValue(dt);

  $("#orderType").value = o.tipo || "Retirada";
  $("#orderClient").value = o.clientId || "";
  $("#orderPhone").value = o.telefoneSnapshot || "";
  $("#orderNotes").value = o.observacoes || "";
  $("#orderStatus").value = o.status || "Pendente";
  $("#orderTotal").value = String(o.valorTotal ?? "").replace(".", ",");
  $("#orderPayment").value = o.formaPagamento || "";
  $("#orderDeposit").value = (o.sinalEntrada != null) ? String(o.sinalEntrada).replace(".", ",") : "";

  itemsContainer.innerHTML = "";
  const itens = Array.isArray(o.itens) ? o.itens : [];
  if (!itens.length) addItemRow();
  itens.forEach(i => addItemRow(i.nome, i.qtd));
}

function toDateTimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addItemRow(nome = "", qtd = 1) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input class="input" placeholder="Nome do item" value="${escapeHtml(nome)}" />
    <input class="input" type="number" min="1" step="1" value="${Number(qtd) || 1}" />
    <button class="icon-btn" type="button" title="Remover">−</button>
  `;

  row.querySelector("button").addEventListener("click", () => {
    row.remove();
    if (!itemsContainer.children.length) addItemRow();
  });

  itemsContainer.appendChild(row);
}

function collectItems() {
  const itens = [];
  [...itemsContainer.children].forEach(row => {
    const inputs = row.querySelectorAll("input");
    const nome = (inputs[0].value || "").trim();
    const qtd = Number(inputs[1].value || 0);
    if (nome && qtd > 0) itens.push({ nome, qtd });
  });
  return itens;
}

/* =========================
   CLIENTES
========================= */
$("#clientForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const nome = $("#clientName").value.trim();
    const telefone = $("#clientPhone").value.trim();
    const observacoes = $("#clientNotes").value.trim();

    if (!nome) return showToast("Nome do cliente é obrigatório.");
    if (!telefone) return showToast("Telefone do cliente é obrigatório.");

    await fs.addDoc(fs.collection(db, "clients"), {
      nome,
      telefone,
      observacoes,
      criadoEm: fs.serverTimestamp()
    });

    $("#clientForm").reset();
    showToast("Cliente salvo.");
    await loadClients();
  } catch (err) {
    showToast(prettyFsError(err));
  }
});

$("#btnReloadClients").addEventListener("click", loadClients);
$("#clientSearch").addEventListener("input", renderClientsList);

async function loadClients() {
  try {
    setOnlineBadge();

    const q = fs.query(
      fs.collection(db, "clients"),
      fs.orderBy("criadoEm", "desc"),
      fs.limit(500)
    );

    const snap = await fs.getDocs(q);
    const list = [];
    snap.forEach(docu => list.push({ id: docu.id, ...docu.data() }));
    state.cacheClients = list;

    const sel = $("#orderClient");
    sel.innerHTML = `<option value="">Selecione...</option>` + list
      .map(c => `<option value="${c.id}">${escapeHtml(c.nome)} • ${escapeHtml(c.telefone || "")}</option>`)
      .join("");

    renderClientsList();
    return list;
  } catch (err) {
    showToast(prettyFsError(err));
    return [];
  }
}

function renderClientsList() {
  const q = ($("#clientSearch").value || "").trim().toLowerCase();

  const filtered = state.cacheClients.filter(c => {
    if (!q) return true;
    const nome = (c.nome || "").toLowerCase();
    const tel = (c.telefone || "").toLowerCase();
    return nome.includes(q) || tel.includes(q);
  });

  $("#clientsList").innerHTML = filtered.length
    ? filtered.map(c => clientCardHTML(c)).join("")
    : emptyHTML("Nenhum cliente encontrado.");

  $("#clientsList").querySelectorAll("button[data-use-client]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.useClient;
      goto("order-new");
      setTimeout(() => {
        $("#orderClient").value = id;
        const c = state.cacheClients.find(x => x.id === id);
        if (c) $("#orderPhone").value = c.telefone || "";
      }, 350);
    });
  });
}

function clientCardHTML(c) {
  return `
    <div class="list-item">
      <strong>${escapeHtml(c.nome || "Cliente")}</strong>
      <div class="row"><div>${escapeHtml(c.telefone || "—")}</div></div>
      <div class="item-actions">
        <button class="btn small btn-primary" type="button" data-use-client="${c.id}">
          Usar na encomenda
        </button>
      </div>
    </div>
  `;
}

// Cliente rápido no formulário
$("#btnCreateQuickClient").addEventListener("click", async () => {
  try {
    const nome = ($("#qcName").value || "").trim();
    const telefone = ($("#qcPhone").value || "").trim();
    const observacoes = ($("#qcObs").value || "").trim();

    if (!nome || !telefone) return showToast("Nome e telefone do cliente são obrigatórios.");

    const ref = await fs.addDoc(fs.collection(db, "clients"), {
      nome, telefone, observacoes, criadoEm: fs.serverTimestamp()
    });

    $("#qcName").value = "";
    $("#qcPhone").value = "";
    $("#qcObs").value = "";

    showToast("Cliente criado.");
    await loadClients();

    $("#orderClient").value = ref.id;
    $("#orderPhone").value = telefone;
  } catch (err) {
    showToast(prettyFsError(err));
  }
});

/* =========================
   CALENDÁRIO
========================= */
$("#calPrev").addEventListener("click", async () => {
  const d = new Date(state.calendar.year, state.calendar.month - 1, 1);
  state.calendar.year = d.getFullYear();
  state.calendar.month = d.getMonth();
  await loadCalendarMonth(state.calendar.year, state.calendar.month);
});
$("#calNext").addEventListener("click", async () => {
  const d = new Date(state.calendar.year, state.calendar.month + 1, 1);
  state.calendar.year = d.getFullYear();
  state.calendar.month = d.getMonth();
  await loadCalendarMonth(state.calendar.year, state.calendar.month);
});
$("#calToday").addEventListener("click", async () => {
  const d = new Date();
  state.calendar.year = d.getFullYear();
  state.calendar.month = d.getMonth();
  await loadCalendarMonth(state.calendar.year, state.calendar.month);
});

async function loadCalendarMonth(year, month) {
  try {
    setOnlineBadge();

    const base = new Date(year, month, 1);
    $("#calTitle").textContent = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
      .format(base)
      .replace(/^./, c => c.toUpperCase());

    const start = startOfMonth(base);
    const end = endOfMonth(base);

    const orders = await fetchOrdersByRange(start, end);

    const dayMap = new Map();
    orders.forEach(o => {
      const dt = o.dataHoraTimestamp.toDate();
      const key = keyYMD(dt);
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key).push(o);
    });

    renderCalendarGrid(base, dayMap);

    $("#dayOrdersTitle").textContent = "Encomendas do dia";
    $("#dayOrdersSubtitle").textContent = "Selecione um dia no calendário.";
    $("#listDayOrders").innerHTML = emptyHTML("—");
  } catch (err) {
    showToast(prettyFsError(err));
  }
}

function keyYMD(dateObj) {
  const pad = (n) => String(n).padStart(2,"0");
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth()+1)}-${pad(dateObj.getDate())}`;
}

function renderCalendarGrid(baseMonthDate, dayMap) {
  const grid = $("#calendarGrid");
  grid.innerHTML = "";

  const year = baseMonthDate.getFullYear();
  const month = baseMonthDate.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const startDow = firstOfMonth.getDay();
  const startCellDate = new Date(year, month, 1 - startDow);

  const todayKey = keyYMD(new Date());

  for (let i = 0; i < 42; i++) {
    const cellDate = addDays(startCellDate, i);
    const cellKey = keyYMD(cellDate);

    const inMonth = cellDate.getMonth() === month;
    const orders = dayMap.get(cellKey) || [];
    const count = orders.length;

    const cell = document.createElement("div");
    cell.className = "cal-cell" + (inMonth ? "" : " dim");
    cell.innerHTML = `
      <div class="cal-daynum">${cellDate.getDate()}</div>
      <div class="cal-ind">
        ${count > 0 ? `<span class="dot"></span>` : ""}
        ${count > 0 ? `<span class="counter">${count}</span>` : ""}
      </div>
    `;

    if (cellKey === todayKey) {
      cell.style.outline = "2px solid rgba(255,209,102,.35)";
      cell.style.outlineOffset = "-2px";
      cell.style.borderRadius = "10px";
    }

    cell.addEventListener("click", () => {
      const title = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(cellDate);
      $("#dayOrdersSubtitle").textContent = title;

      const list = orders.slice().sort((a,b) => a.dataHoraTimestamp.toDate() - b.dataHoraTimestamp.toDate());

      $("#listDayOrders").innerHTML = list.length
        ? list.map(o => orderCardHTML(o, { mode: "list" })).join("")
        : emptyHTML("Nenhuma encomenda nesse dia.");

      wireOrderCardButtons($("#listDayOrders"));
    });

    grid.appendChild(cell);
  }
}

/* =========================
   CONFIRMAÇÃO (WhatsApp + PDF estilo Apple)
========================= */
function openReceipt(order) {
  const dt = order.dataHoraTimestamp?.toDate?.() ? order.dataHoraTimestamp.toDate() : new Date();
  const { d, t } = formatDateTimePtBR(dt);

  const whatsapp = order.telefoneSnapshot || "—";
  const total = formatMoneyBRL(order.valorTotal || 0);

  const itens = Array.isArray(order.itens) ? order.itens : [];
  const itensResumo = itens.length ? itens.map(i => `${i.nome} (x${i.qtd})`).join(", ") : "—";

  const itensHtml = itens.length
    ? itens.map(i => `
      <div class="ri">
        <span>${escapeHtml(i.nome)}</span>
        <span class="q">x${Number(i.qtd) || 1}</span>
      </div>
    `).join("")
    : `<div class="ri"><span>—</span><span class="q"></span></div>`;

  const pedidoIdCurto = String(order.id || "").slice(0, 10).toUpperCase();
  const dataEmissao = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());

  const receiptHTML = `
<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Confirmação de Encomenda</title>
<style>
  body{font-family:-apple-system,system-ui,Segoe UI,Roboto,Arial; margin:0; background:#f2f2f7; color:#111;}
  .wrap{max-width:760px; margin:24px auto; padding:18px;}
  .card{background:#fff; border-radius:16px; box-shadow:0 10px 30px rgba(0,0,0,.08); overflow:hidden;}
  .top{padding:22px 22px 10px;}
  .date{color:#666; font-size:14px; margin-bottom:10px;}
  .meta{display:grid; gap:6px; font-size:15px;}
  .meta b{display:inline-block; width:120px;}
  .line{height:1px; background:#eee; margin:10px 0;}
  .prod{display:flex; gap:14px; padding:18px 22px; align-items:flex-start;}
  .badge{width:44px; height:44px; border-radius:12px; background:#0a84ff; display:grid; place-items:center; color:#fff; font-weight:800;}
  .prod h2{margin:0; font-size:18px;}
  .prod .sub{color:#666; margin-top:3px; font-size:14px;}
  .price{margin-left:auto; font-weight:800; font-size:18px; white-space:nowrap;}
  .sect{padding:0 22px 18px;}
  .sect h3{margin:14px 0 8px; font-size:16px;}
  .ri{display:flex; justify-content:space-between; border-bottom:1px solid #f0f0f0; padding:8px 0; color:#333; gap:12px;}
  .q{color:#666; white-space:nowrap;}
  .foot{padding:14px 22px 22px; color:#666; font-size:13px;}
  .actions{display:flex; gap:10px; padding:14px 22px 22px; flex-wrap:wrap;}
  button{border:0; border-radius:12px; padding:10px 12px; font-weight:700; cursor:pointer;}
  .p{background:#0a84ff; color:#fff;}
  .g{background:#e9e9ee;}
  @media print{
    .actions{display:none;}
    body{background:#fff;}
    .wrap{margin:0; max-width:none; padding:0;}
    .card{box-shadow:none; border-radius:0;}
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="top">
        <div class="date">${escapeHtml(dataEmissao)}</div>
        <div class="meta">
          <div><b>Pedido ID:</b> ${escapeHtml(pedidoIdCurto)}</div>
          <div><b>Documento:</b> ${escapeHtml(String(order.id || ""))}</div>
          <div><b>WhatsApp:</b> ${escapeHtml(whatsapp)}</div>
        </div>
      </div>

      <div class="line"></div>

      <div class="prod">
        <div class="badge">D</div>
        <div>
          <h2>Docce Cheesecake</h2>
          <div class="sub">Confirmação de encomenda • ${escapeHtml(order.tipo || "—")}</div>
          <div class="sub">Agendado para ${escapeHtml(d)} às ${escapeHtml(t)}</div>
          <div class="sub">Status: <b>${escapeHtml(order.status || "—")}</b></div>
        </div>
        <div class="price">${escapeHtml(total)}</div>
      </div>

      <div class="line"></div>

      <div class="sect">
        <h3>Itens</h3>
        ${itensHtml}

        <h3 style="margin-top:16px;">Cliente</h3>
        <div class="ri">
          <span>${escapeHtml(order.clientNomeSnapshot || "—")}</span>
          <span class="q">${escapeHtml(whatsapp)}</span>
        </div>

        <h3 style="margin-top:16px;">Observações</h3>
        <div class="ri">
          <span>${escapeHtml(order.observacoes || "—")}</span>
          <span class="q"></span>
        </div>
      </div>

      <div class="actions">
        <button class="g" onclick="copyWhats()">Copiar texto WhatsApp</button>
        <button class="p" onclick="window.print()">Gerar PDF (Imprimir)</button>
      </div>

      <div class="foot">
        Esta confirmação registra o agendamento da encomenda e o status atual.
      </div>
    </div>
  </div>

<script>
function copyWhats(){
  const text =
\`Confirmação de Encomenda — Docce Cheesecake
Olá, ${escapeJs(order.clientNomeSnapshot || "Cliente")}! ✅
Status: ${escapeJs(order.status || "—")}

📅 ${escapeJs(d)} às ${escapeJs(t)}
📦 ${escapeJs(order.tipo || "—")}
🧾 Pedido: ${escapeJs(pedidoIdCurto)}
🍰 Itens: ${escapeJs(itensResumo)}
💰 Total: ${escapeJs(total)}
📲 WhatsApp: ${escapeJs(whatsapp)}

Observações: ${escapeJs(order.observacoes || "—")}\`;

  navigator.clipboard.writeText(text)
    .then(()=>alert("Texto copiado!"))
    .catch(()=>alert("Não foi possível copiar automaticamente. Selecione e copie manualmente."));
}
function escapeJs(s){
  return String(s||"")
    .replaceAll("\\\\","\\\\\\\\")
    .replaceAll("`","\\`")
    .replaceAll("$","\\$")
}
</script>

</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) {
    showToast("Bloqueador de pop-up impediu abrir a confirmação. Permita pop-ups para este site.");
    return;
  }
  w.document.open();
  w.document.write(receiptHTML);
  w.document.close();
}

/* =========================
   ERROS
========================= */
function prettyFsError(err) {
  const code = err?.code || "";
  if (!navigator.onLine) return "Sem internet. Verifique sua conexão.";
  if (code.includes("permission-denied")) return "Permissão negada. Verifique as Security Rules.";
  if (code.includes("unavailable")) return "Serviço indisponível no momento. Tente novamente.";
  return "Erro ao acessar o banco. Tente novamente.";
}

/* =========================
   BOOTSTRAP
========================= */
setOnlineBadge();

fa.onAuthStateChanged(auth, async (user) => {
  state.user = user || null;

  if (!user) {
    helloUser.textContent = "Olá, —";
    btnLogout.hidden = true;
    sidebar.hidden = true;
    showView("login");
    goto("login");
    return;
  }

  applyUserUI();

  const d = new Date();
  state.calendar.year = d.getFullYear();
  state.calendar.month = d.getMonth();

  const { route } = getRouteFromHash();
  if (!route || route === "login") goto("dashboard");
  await handleRoute();
});

handleRoute();
