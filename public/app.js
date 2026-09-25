const state = { products: [], selectedProduct: null };
const $ = (selector) => document.querySelector(selector);

function updateClock() {
  $('#clock').textContent = `${new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date())} GT`;
}

async function request(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Operación no disponible');
  return body;
}

async function loadProducts() {
  try {
    state.products = await request('/api/products');
    renderProducts();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderProducts() {
  const query = $('#search').value.trim().toLowerCase();
  const filtered = state.products.filter((product) => `${product.sku} ${product.name}`.toLowerCase().includes(query));
  $('#metric-products').textContent = String(state.products.length).padStart(2, '0');
  $('#metric-units').textContent = String(state.products.reduce((sum, product) => sum + product.quantity, 0)).padStart(3, '0');
  $('#metric-low').textContent = String(state.products.filter((product) => product.quantity <= product.reorderPoint).length).padStart(2, '0');
  $('#result-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'SEÑAL' : 'SEÑALES'}`;
  $('#empty-state').style.display = filtered.length ? 'none' : 'flex';
  $('#inventory-body').innerHTML = filtered.map((product) => {
    const low = product.quantity <= product.reorderPoint;
    return `<tr>
      <td>${escapeHtml(product.sku)}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${product.quantity}</td>
      <td>${product.reorderPoint}</td>
      <td><span class="status ${low ? 'low' : ''}">${low ? 'REABASTECER' : 'ESTABLE'}</span></td>
      <td><button class="movement-btn" data-product="${product.id}">± MOVIMIENTO</button></td>
    </tr>`;
  }).join('');
}

function toast(message, isError = false) {
  const element = $('#toast');
  element.textContent = message;
  element.className = isError ? 'show error' : 'show';
  clearTimeout(toast.timeout);
  toast.timeout = setTimeout(() => { element.className = ''; }, 3500);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char]);
}

document.addEventListener('click', (event) => {
  const openButton = event.target.closest('[data-open]');
  if (openButton) $(`#${openButton.dataset.open}`).showModal();
  if (event.target.closest('[data-close]')) event.target.closest('dialog').close();
  const movementButton = event.target.closest('[data-product]');
  if (movementButton) {
    state.selectedProduct = state.products.find((product) => product.id === movementButton.dataset.product);
    $('#movement-product').textContent = `${state.selectedProduct.sku} · ${state.selectedProduct.name} · ${state.selectedProduct.quantity} unidades disponibles`;
    $('#movement-dialog').showModal();
  }
});

$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await request('/api/products', { method: 'POST', body: JSON.stringify({
      sku: data.get('sku'), name: data.get('name'),
      initialQuantity: Number(data.get('initialQuantity')), reorderPoint: Number(data.get('reorderPoint')),
    }) });
    form.reset();
    form.querySelector('[name=sku]').value = 'ORB-';
    $('#product-dialog').close();
    toast('Componente registrado en PostgreSQL');
    await loadProducts();
  } catch (error) { toast(error.message, true); }
});

$('#movement-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  try {
    await request(`/api/products/${state.selectedProduct.id}/movements`, { method: 'POST', body: JSON.stringify({
      type: data.get('type'), quantity: Number(data.get('quantity')), note: data.get('note'),
    }) });
    form.reset();
    $('#movement-dialog').close();
    toast('Movimiento confirmado de forma transaccional');
    await loadProducts();
  } catch (error) { toast(error.message, true); }
});

$('#search').addEventListener('input', renderProducts);
$('#refresh').addEventListener('click', loadProducts);
setInterval(updateClock, 1000);
updateClock();
loadProducts();
