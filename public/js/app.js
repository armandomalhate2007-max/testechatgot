(() => {
  const { api, uploadImage } = window.AtelierAPI;

const state = window.state = {    products: [],
    adminProducts: [],
    cart: [],
    settings: {
      shopName: 'Atelier',
      currency: 'MT',
      whatsapp: ''
    },
    user: null,
    currentAdminTab: 'dashboard',
    orderFilter: 'ALL',
    productFilter: 'ALL',
    productSearch: '',
    orderSearch: '',
    adminProductPage: 1,
    adminOrderPage: 1,
    fulfillmentMethod: 'DELIVERY',
    deliveryQuote: null,
    pendingOrderKey: null
  };

  const currencySymbols = {
    MT: 'MT',
    EUR: '€',
    USD: '$',
    BRL: 'R$',
    GBP: '£'
  };

  function toCents(value) {
    const s = String(value).trim();
    const m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/);

    if (!m) return 0;

    const cents =
      BigInt(m[1]) * 100n +
      BigInt((m[2] || '').padEnd(2, '0'));

    if (cents > 9007199254740991n) {
      throw new Error('Preço demasiado elevado.');
    }

    return Number(cents);
  }

  function moneyCents(cents, currency) {
    return money(Number(cents) / 100, currency);
  }

  function money(value, currency) {
    const locale =
      currency === 'MT'
        ? 'pt-MZ'
        : currency === 'BRL'
          ? 'pt-BR'
          : currency === 'USD'
            ? 'en-US'
            : currency === 'GBP'
              ? 'en-GB'
              : 'pt-PT';

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency === 'MT' ? 'MZN' : currency,
      maximumFractionDigits: currency === 'MT' ? 0 : 2
    }).format(Number(value));
  }

  function esc(v = '') {
    return String(v).replace(
      /[&<>'"]/g,
      c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[c])
    );
  }

  function toast(msg, error = false) {
    const el = document.getElementById('toast');

    if (!el) return;

    el.textContent = msg;
    el.className =
      `fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-lg text-sm shadow-lg ` +
      `${error ? 'bg-red-600' : 'bg-zinc-900'} text-white`;

    setTimeout(() => el.classList.add('hidden'), 3200);
  }

  function setPage(id) {
    const pages = document.querySelectorAll('.page-section');

    if (pages.length) {
      pages.forEach(x => x.classList.remove('active'));
    }

    const pageId =
      id === 'store' ? 'store-page' :
      id === 'admin' ? 'admin-page' :
      id;

    const page = document.getElementById(pageId);

    if (!page) {
      console.error(`Página não encontrada: ${id}`);
      return;
    }

    if (pageId === 'store-page' || pageId === 'admin-page') {
      document.getElementById('store-page')?.classList.add('hidden');
      document.getElementById('admin-page')?.classList.add('hidden');
      page.classList.remove('hidden');
    } else {
      page.classList.add('active');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function loadStore() {
    try {
      state.settings = {
        ...state.settings,
        ...(await api('/settings/public'))
      };

      state.products = await api('/products');

      renderStore();
    } catch (e) {
      console.error('Erro ao carregar loja:', e);
      toast('Não foi possível carregar a loja.', true);
    }
  }

  function renderStore() {
    const title = document.getElementById('store-title');
    const box = document.getElementById('products');

    if (title) {
      title.textContent = state.settings.shopName || 'Atelier';
    }

    if (!box) return;

    box.innerHTML = state.products.length
      ? state.products
          .map(p => {
            const stock =
              p.sizes?.reduce((s, x) => s + x.stock, 0) || 0;

            return `
              <article class="flex-none w-72 bg-white rounded-xl overflow-hidden border border-gray-200 shadow-sm flex flex-col">
                <div class="relative bg-gray-100 h-72">
                  <img
                    src="${esc(p.imageUrl || '/placeholder.svg')}"
                    alt="${esc(p.name)}"
                    class="object-cover w-full h-full"
                    loading="lazy"
                    onerror="this.src='/placeholder.svg'"
                  >

                  ${
                    p.limited
                      ? '<span class="absolute top-3 left-3 bg-zinc-950 text-white text-[10px] uppercase tracking-wider px-2 py-1 rounded">Exclusivo</span>'
                      : ''
                  }
                </div>

                <div class="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <h3 class="font-semibold">${esc(p.name)}</h3>

                    <p class="text-xs text-gray-400 font-mono mt-1">
                      ${esc(p.ref)}
                    </p>

                    <p class="text-sm text-gray-500 mt-2">
                      ${esc(p.description || '')}
                    </p>
                  </div>

                  <div class="flex items-center justify-between">
                    <span class="font-bold">
                      ${money(p.price, p.currency)}
                    </span>

                    <button
                      ${stock <= 0 ? 'disabled' : ''}
                      onclick="openProduct('${p.id}')"
                      class="bg-zinc-900 disabled:bg-gray-300 text-white text-xs px-3 py-2 rounded-lg"
                    >
                      ${stock > 0 ? 'Comprar' : 'Sem stock'}
                    </button>
                  </div>
                </div>
              </article>
            `;
          })
          .join('')
      : `
        <div class="w-full py-16 text-center text-gray-400">
          Novas peças exclusivas a caminho.
        </div>
      `;

    const cartCount = document.getElementById('cart-count');

    if (cartCount) {
      cartCount.textContent = state.cart.reduce(
        (s, i) => s + i.quantity,
        0
      );
    }
  }

  function openProduct(id) {
    const p = state.products.find(x => x.id === id);

    if (!p) return;

    const modal = document.getElementById('product-modal');
    const content = document.getElementById('modal-product');

    if (!modal || !content) return;

    modal.classList.remove('hidden');

    content.innerHTML = `
      <div class="flex gap-4">
        <img
          src="${esc(p.imageUrl || '')}"
          class="w-28 h-28 object-cover rounded-lg bg-gray-100"
        >

        <div>
          <h3 class="font-bold text-lg">
            ${esc(p.name)}
          </h3>

          <p class="text-xs text-gray-400">
            ${esc(p.ref)}
          </p>

          <p class="font-semibold mt-2">
            ${money(p.price, p.currency)}
          </p>
        </div>
      </div>

      <p class="text-sm text-gray-600 mt-4">
        ${esc(p.description || '')}
      </p>

      <label class="block text-xs font-semibold uppercase mt-4 mb-2">
        Tamanho
      </label>

      <div class="flex flex-wrap gap-2">
        ${p.sizes
          .filter(s => s.stock > 0)
          .map(
            s => `
              <button
                class="size-choice border px-3 py-2 rounded-lg text-sm"
                data-size="${esc(s.size)}"
                data-stock="${s.stock}"
              >
                ${esc(s.size)}
                <span class="text-gray-400">
                  (${s.stock})
                </span>
              </button>
            `
          )
          .join('')}
      </div>

      <label class="block text-xs font-semibold uppercase mt-4 mb-2">
        Quantidade
      </label>

      <input
        id="modal-qty"
        type="number"
        min="1"
        value="1"
        class="w-full border rounded-lg p-2"
      >

      <button
        onclick="addToCart('${p.id}')"
        class="w-full mt-4 bg-zinc-900 text-white py-3 rounded-lg"
      >
        Adicionar ao carrinho
      </button>
    `;

    document.querySelectorAll('.size-choice').forEach(b => {
      b.onclick = () => {
        document
          .querySelectorAll('.size-choice')
          .forEach(x =>
            x.classList.remove(
              'bg-zinc-900',
              'text-white'
            )
          );

        b.classList.add(
          'bg-zinc-900',
          'text-white'
        );
      };
    });
  }

  function addToCart(id) {
    const p = state.products.find(x => x.id === id);

    if (!p) return;

    const b = document.querySelector(
      '.size-choice.bg-zinc-900'
    );

    if (!b) {
      toast('Selecione um tamanho.', true);
      return;
    }

    const qty = Math.max(
      1,
      Number(
        document.getElementById('modal-qty')?.value
      ) || 1
    );

    const stock = Number(b.dataset.stock);

    if (qty > stock) {
      toast('Quantidade superior ao stock.', true);
      return;
    }

    const old = state.cart.find(
      i =>
        i.productId === id &&
        i.size === b.dataset.size
    );

    if (old) {
      old.quantity = Math.min(
        stock,
        old.quantity + qty
      );
    } else {
      state.cart.push({
        productId: id,
        size: b.dataset.size,
        quantity: qty
      });
    }

    document
      .getElementById('product-modal')
      ?.classList.add('hidden');

    renderCart();
    toast('Produto adicionado ao carrinho.');
  }

  function renderCart() {
    const wrap =
      document.getElementById('cart-items');

    if (!wrap) return;

    if (!state.cart.length) {
      wrap.innerHTML =
        '<p class="text-sm text-gray-400">O carrinho está vazio.</p>';

      const total =
        document.getElementById('cart-total');

      if (total) {
        total.textContent = '—';
      }

      return;
    }

    let totalCents = 0;

    wrap.innerHTML = state.cart
      .map((i, n) => {
        const p = state.products.find(
          x => x.id === i.productId
        );

        if (!p) return '';

        const lineCents =
          toCents(p.price) * i.quantity;

        totalCents += lineCents;

        return `
          <div class="flex justify-between gap-3 border-b py-3">
            <div>
              <p class="font-medium text-sm">
                ${esc(p.name)}
              </p>

              <p class="text-xs text-gray-400">
                ${esc(i.size)} · ${i.quantity}x
              </p>
            </div>

            <div class="text-right">
              <p class="font-semibold text-sm">
                ${moneyCents(lineCents, p.currency)}
              </p>

              <button
                onclick="removeCart(${n})"
                class="text-xs text-red-500"
              >
                remover
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    const firstProduct = state.cart[0]
      ? state.products.find(
          p => p.id === state.cart[0].productId
        )
      : null;

    const total =
      document.getElementById('cart-total');

    if (total && firstProduct) {
      total.textContent = moneyCents(
        totalCents,
        firstProduct.currency
      );
    }
  }

  function removeCart(n) {
    state.cart.splice(n, 1);
    renderCart();
  }

  function openCart() {
    const modal =
      document.getElementById('cart-modal');

    if (!modal) return;

    modal.classList.remove('hidden');
    renderCart();
  }

  async function setFulfillment(method) {
    state.fulfillmentMethod = method;
    state.deliveryQuote = null;

    const delivery =
      document.getElementById(
        'fulfillment-delivery'
      );

    const pickup =
      document.getElementById(
        'fulfillment-pickup'
      );

    const quote =
      document.getElementById(
        'delivery-quote'
      );

    if (delivery) {
      delivery.className =
        `border rounded-lg py-2 text-sm ${
          method === 'DELIVERY'
            ? 'bg-zinc-900 text-white'
            : ''
        }`;
    }

    if (pickup) {
      pickup.className =
        `border rounded-lg py-2 text-sm ${
          method === 'PICKUP'
            ? 'bg-zinc-900 text-white'
            : ''
        }`;
    }

    if (quote) {
      quote.textContent =
        method === 'PICKUP'
          ? 'Retirada na loja: sem custo de entrega.'
          : 'A entrega será calculada pela localização no momento da confirmação.';
    }
  }

  async function checkout() {
    if (!state.cart.length) {
      toast('Carrinho vazio.', true);
      return;
    }

    const name =
      document.getElementById(
        'checkout-name'
      )?.value.trim() || '';

    const phone =
      document.getElementById(
        'checkout-phone'
      )?.value.trim() || '';

    if (
      name.length < 2 ||
      phone.length < 8
    ) {
      toast(
        'Indique nome e telefone.',
        true
      );
      return;
    }

    const country =
      document.getElementById(
        'checkout-country'
      )?.value.trim() || '';

    const city =
      document.getElementById(
        'checkout-city'
      )?.value.trim() || '';

    const address =
      document.getElementById(
        'checkout-address'
      )?.value.trim() || '';

    if (
      state.fulfillmentMethod ===
      'DELIVERY'
    ) {
      if (
        !country ||
        !city ||
        address.length < 5
      ) {
        toast(
          'Preencha país, cidade e morada.',
          true
        );
        return;
      }
    }

    const currencySet = new Set(
      state.cart.map(
        i =>
          state.products.find(
            p => p.id === i.productId
          )?.currency
      )
    );

    if (currencySet.size !== 1) {
      toast(
        'Todos os itens devem usar a mesma moeda.',
        true
      );
      return;
    }

    const base = {
      items: state.cart,
      customerName:
        name || undefined,
      customerPhone:
        phone || undefined,
      country:
        country || undefined,
      city:
        city || undefined,
      address:
        address || undefined,
      fulfillmentMethod:
        state.fulfillmentMethod
    };

    if (
      state.fulfillmentMethod ===
      'PICKUP'
    ) {
      return createOrder(base);
    }

    if (!navigator.geolocation) {
      toast(
        'Este navegador não disponibiliza localização. Escolha retirada na loja.',
        true
      );
      return;
    }

    try {
      const pos =
        await new Promise(
          (resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              {
                enableHighAccuracy: true,
                timeout: 8000
              }
            )
        );

      await createOrder({
        ...base,
        latitude:
          pos.coords.latitude,
        longitude:
          pos.coords.longitude
      });
    } catch {
      toast(
        'Não foi possível obter a localização para entrega. Escolha retirada na loja ou permita a localização.',
        true
      );
    }
  }

  async function pollPayment(
    paymentId,
    orderId
  ) {
    for (let i = 0; i < 12; i++) {
      await new Promise(
        r => setTimeout(r, 5000)
      );

      try {
        const p = await api(
          `/payments/${encodeURIComponent(
            paymentId
          )}/refresh`,
          {
            method: 'POST'
          }
        );

        if (p.status === 'PAID') {
          toast(
            `Pagamento confirmado. Pedido ${orderId}.`
          );
          return;
        }

        if (
          [
            'FAILED',
            'CANCELLED',
            'EXPIRED',
            'REFUNDED'
          ].includes(p.status)
        ) {
          toast(
            `Pagamento ${String(
              p.status
            ).toLowerCase()}. Pedido ${orderId} permanece pendente.`,
            true
          );
          return;
        }
      } catch {}
    }

    toast(
      `Ainda não recebemos a confirmação do pagamento do pedido ${orderId}.`
    );
  }

  async function createOrder(payload) {
    const btn =
      document.querySelector(
        '#cart-modal button[onclick="checkout()"]'
      );

    if (!state.pendingOrderKey) {
      state.pendingOrderKey =
        crypto.randomUUID();
    }

    if (btn) btn.disabled = true;

    try {
      const order = await api(
        '/orders',
        {
          method: 'POST',
          headers: {
            'Idempotency-Key':
              state.pendingOrderKey
          },
          body: JSON.stringify(payload)
        }
      );

      const method =
        document.getElementById(
          'checkout-payment'
        )?.value || 'MANUAL';

      let payment = null;

      try {
        payment = await api(
          `/orders/${encodeURIComponent(
            order.id
          )}/payments`,
          {
            method: 'POST',
            body: JSON.stringify({
              method
            })
          }
        );
      } catch (e) {
        toast(
          `Pedido criado, mas o pagamento não iniciou: ${e.message}`,
          true
        );
      }

      state.pendingOrderKey = null;
      state.cart = [];

      renderStore();

      document
        .getElementById('cart-modal')
        ?.classList.add('hidden');

      if (payment) {
        const label =
          payment.status === 'PAID'
            ? 'Pagamento confirmado'
            : payment.status ===
                'PROCESSING'
              ? 'Pagamento iniciado'
              : 'Pagamento pendente';

        toast(
          `${label}. Pedido ${order.id}.`
        );

        if (
          ['MPESA', 'EMOLA'].includes(
            method
          ) &&
          ['PROCESSING', 'PENDING'].includes(
            payment.status
          )
        ) {
          pollPayment(
            payment.id,
            order.id
          );
        }
      } else {
        toast(
          `Pedido ${order.id} registado.`
        );
      }

      if (
        method === 'MANUAL' &&
        state.settings.whatsapp
      ) {
        const text =
          `Olá! Gostaria de confirmar o pedido ${order.id}.`;

        window.open(
          `https://wa.me/${encodeURIComponent(
            state.settings.whatsapp
          )}?text=${encodeURIComponent(text)}`,
          '_blank'
        );
      }
    } catch (e) {
      toast(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function login(event) {
    event?.preventDefault();

    const email =
      document.getElementById(
        'login-email'
      )?.value.trim() || '';

    const password =
      document.getElementById(
        'login-password'
      )?.value || '';

    try {
      const r = await api(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email,
            password
          })
        }
      );

      if (r.requires2FA) {
        document
          .getElementById('tfa-modal')
          ?.classList.remove('hidden');
      } else {
        await afterLogin();
      }
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function verify2fa() {
    try {
      await api(
        '/auth/2fa/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            code:
              document
                .getElementById(
                  'tfa-code'
                )
                ?.value.trim() || ''
          })
        }
      );

      document
        .getElementById('tfa-modal')
        ?.classList.add('hidden');

      await afterLogin();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function afterLogin() {
    state.user = await api('/auth/me');

    setPage('admin-page');

    document.getElementById('admin-login')?.classList.add('hidden');
    document.getElementById('admin-content')?.classList.remove('hidden');

    await loadAdmin();
  }

  async function logout() {
    await api(
      '/auth/logout',
      {
        method: 'POST'
      }
    );

    state.user = null;

    setPage('store-page');
  }

  async function loadAdmin() {
    try {
      const [
        summary,
        products,
        orders,
        settings
      ] = await Promise.all([
        api('/dashboard/summary'),

        api(
          `/admin/products?q=${encodeURIComponent(
            state.productSearch
          )}&active=${
            state.productFilter.toLowerCase()
          }&page=${
            state.adminProductPage
          }`
        ),

        api(
          `/orders?status=${
            state.orderFilter
          }&q=${encodeURIComponent(
            state.orderSearch
          )}&page=${
            state.adminOrderPage
          }`
        ),

        api('/settings')
      ]);

      state.adminProducts =
        products.items;

      state.adminOrders =
        orders.items;

      state.adminProductMeta =
        products;

      state.adminOrderMeta =
        orders;

      state.settings = {
        ...state.settings,
        ...settings
      };

      const cfgName =
        document.getElementById(
          'cfg-name'
        );

      if (cfgName) {
        cfgName.value =
          state.settings.shopName || '';
      }

      const cfgCurrency =
        document.getElementById(
          'cfg-currency'
        );

      if (cfgCurrency) {
        cfgCurrency.value =
          state.settings.currency || 'MT';
      }

      const cfgWhatsapp =
        document.getElementById(
          'cfg-whatsapp'
        );

      if (cfgWhatsapp) {
        cfgWhatsapp.value =
          state.settings.whatsapp || '';
      }

      const cfgBase =
        document.getElementById(
          'cfg-base'
        );

      if (cfgBase) {
        cfgBase.value =
          state.settings.deliveryBaseCost ??
          150;
      }

      const cfgPerKm =
        document.getElementById(
          'cfg-per-km'
        );

      if (cfgPerKm) {
        cfgPerKm.value =
          state.settings.deliveryPerKm ??
          25;
      }

      const cfgMaxKm =
        document.getElementById(
          'cfg-max-km'
        );

      if (cfgMaxKm) {
        cfgMaxKm.value =
          state.settings.deliveryMaxKm ??
          100;
      }

      const cfgLat =
        document.getElementById(
          'cfg-lat'
        );

      if (cfgLat) {
        cfgLat.value =
          state.settings.deliveryOriginLat ??
          -25.9692;
      }

      const cfgLng =
        document.getElementById(
          'cfg-lng'
        );

      if (cfgLng) {
        cfgLng.value =
          state.settings.deliveryOriginLng ??
          32.5732;
      }

      renderDashboard(summary);
      renderAdminProducts();
      renderAdminOrders();
    } catch (e) {
      console.error(
        'Erro ao carregar painel:',
        e
      );

      toast(
        'Sessão expirada ou erro no painel.',
        true
      );

      return;
    }
  }

  function switchTab(t) {
    state.currentAdminTab = t;

    document
      .querySelectorAll('.admin-content')
      .forEach(x =>
        x.classList.add('hidden')
      );

    const tab = document.getElementById(
      'admin-' +
        (t === 'products'
          ? 'products-tab'
          : t === 'orders'
            ? 'orders-tab'
            : t)
    );

    if (tab) {
      tab.classList.remove('hidden');
    }

    if (t === 'audit') {
      loadAudit();
    }

    if (t === 'security') {
      renderSecurity();
    }

    if (t === 'settings') {
      loadPaymentSettings();
    }
  }

  function renderDashboard(s) {
    const sales = document.getElementById('stat-sales');
    if (sales) sales.textContent = s.salesToday ?? 0;

    const orders = document.getElementById('stat-orders');
    if (orders) orders.textContent = s.ordersCount ?? 0;

    const products = document.getElementById('stat-products');
    if (products) products.textContent = s.productsCount ?? 0;

    const revenue = document.getElementById('stat-revenue');
    if (revenue) {
      revenue.innerHTML =
        Object.entries(s.revenueByCurrency || {})
          .filter(([, v]) => v > 0)
          .map(([c, v]) => `<div>${money(v, c)}</div>`)
          .join('') || '0';
    }
  }

  function productImages(p) {
    const images = Array.isArray(p?.images)
      ? p.images.filter(Boolean)
      : [];
    if (!images.length && p?.imageUrl) images.push(p.imageUrl);
    return images.slice(0, 6);
  }

  function renderPhotoInputs(values = []) {
    const wrap = document.getElementById('prod-image-inputs');
    const countEl = document.getElementById('prod-image-count');
    if (!wrap) return;

    const count = Math.min(6, Math.max(1, Number(countEl?.value) || values.length || 1));
    const current = Array.isArray(values) ? values : [];

    wrap.innerHTML = Array.from({ length: count }, (_, index) => {
      const value = current[index] || '';
      return `
        <div class="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          <div class="aspect-square bg-gray-100 relative flex items-center justify-center overflow-hidden">
            <img data-photo-preview="${index}" src="${esc(value || '/placeholder.svg')}" class="w-full h-full object-cover ${value ? '' : 'hidden'}" onerror="this.classList.add('hidden')">
            <div data-photo-empty="${index}" class="text-center p-4 ${value ? 'hidden' : ''}">
              <div class="text-3xl mb-2">📷</div>
              <p class="text-xs text-gray-500">Adicionar fotografia</p>
            </div>
            ${index === 0 ? '<span class="absolute top-2 left-2 bg-black text-white text-[10px] px-2 py-1 rounded-full">Principal</span>' : ''}
          </div>
          <div class="p-3">
            <label class="block text-xs font-semibold mb-2">Foto ${index + 1}</label>
            <input data-photo-url="${index}" type="url" value="${esc(value)}" placeholder="URL da fotografia" class="w-full border rounded-lg px-3 py-2 text-xs mb-2" oninput="previewPhoto(${index}, this.value)">
            <input data-photo-file="${index}" type="file" accept="image/jpeg,image/png,image/webp" class="w-full text-xs" onchange="previewPhotoFile(${index}, this)">
          </div>
        </div>`;
    }).join('');
  }

  function previewPhoto(index, value) {
    const img = document.querySelector(`[data-photo-preview=\"${index}\"]`);
    const empty = document.querySelector(`[data-photo-empty=\"${index}\"]`);
    if (!img || !empty) return;
    img.src = value || '/placeholder.svg';
    img.classList.toggle('hidden', !value);
    empty.classList.toggle('hidden', !!value);
  }

  function previewPhotoFile(index, input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      input.value = '';
      toast('Cada imagem deve ter no máximo 5 MB.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => previewPhoto(index, reader.result);
    reader.readAsDataURL(file);
  }

  function collectPhotoUrls() {
    return Array.from(document.querySelectorAll('[data-photo-url]'))
      .map(el => el.value.trim())
      .filter(Boolean);
  }

  function renderAdminProducts() {
    const box =
      document.getElementById(
        'admin-products'
      );

    if (!box) return;

    box.innerHTML =
      state.adminProducts
        .map(
          p => `
            <div class="bg-white border rounded-xl p-4">
              <div class="flex gap-3">
                <img
                  src="${esc(
                    p.imageUrl || ''
                  )}"
                  class="w-16 h-16 rounded-lg object-cover"
                >

                <div class="min-w-0">
                  <h4 class="font-semibold truncate">
                    ${esc(p.name)}
                  </h4>

                  <p class="text-xs text-gray-400">
                    ${esc(p.ref)} · ${
                      p.active
                        ? 'Ativo'
                        : 'Inativo'
                    }
                  </p>

                  <p class="font-medium mt-1">
                    ${money(
                      p.price,
                      p.currency
                    )}
                  </p>
                </div>
              </div>

              <div class="flex gap-2 mt-4">
                <button
                  onclick="editProduct('${p.id}')"
                  class="flex-1 bg-gray-100 py-2 rounded text-sm"
                >
                  Editar
                </button>

                ${
                  p.active
                    ? `
                      <button
                        onclick="deleteProduct('${p.id}')"
                        class="text-red-600 bg-red-50 px-3 rounded"
                      >
                        Desativar
                      </button>
                    `
                    : `
                      <button
                        onclick="restoreProduct('${p.id}')"
                        class="text-emerald-700 bg-emerald-50 px-3 rounded"
                      >
                        Reativar
                      </button>
                    `
                }
              </div>
            </div>
          `
        )
        .join('') ||
      '<p class="text-gray-400">Nenhum produto.</p>';

    const pages =
      document.getElementById(
        'product-pages'
      );

    if (pages) {
      pages.textContent =
        `Página ${
          state.adminProductMeta?.page ||
          1
        } de ${
          state.adminProductMeta?.pages ||
          1
        } · ${
          state.adminProductMeta?.total ||
          0
        } produtos`;
    }
  }

  function renderAdminOrders() {
    const arr =
      state.adminOrders;

    const box =
      document.getElementById(
        'admin-orders'
      );

    if (!box) return;

    box.innerHTML =
      arr
        .map(
          o => `
            <div class="bg-white border rounded-xl p-4 flex flex-col md:flex-row justify-between gap-3">
              <div>
                <p class="font-mono font-bold text-sm">
                  ${esc(o.id)}
                </p>

                <p class="font-medium mt-1">
                  ${o.items
                    .map(
                      i =>
                        esc(
                          i.productNameSnapshot
                        )
                    )
                    .join(', ')}
                </p>

                <p class="text-xs text-gray-500 mt-1">
                  ${esc(
                    o.city || ''
                  )}
                  ${esc(
                    o.country || ''
                  )}
                  ·
                  ${new Date(
                    o.createdAt
                  ).toLocaleString(
                    'pt-PT'
                  )}
                </p>

                <button
                  onclick="viewOrder('${o.id}')"
                  class="text-xs underline mt-2"
                >
                  Ver detalhe
                </button>
              </div>

              <div class="flex items-center gap-3">
                <strong>
                  ${money(
                    o.total,
                    o.currency
                  )}
                </strong>

                <select
                  onchange="changeStatus('${o.id}',this.value)"
                  class="border rounded p-2 text-sm"
                >
                  <option
                    value="PENDING"
                    ${
                      o.status ===
                      'PENDING'
                        ? 'selected'
                        : ''
                    }
                  >
                    Pendente
                  </option>

                  <option
                    value="CONFIRMED"
                    ${
                      o.status ===
                      'CONFIRMED'
                        ? 'selected'
                        : ''
                    }
                  >
                    Confirmado
                  </option>

                  <option
                    value="DELIVERED"
                    ${
                      o.status ===
                      'DELIVERED'
                        ? 'selected'
                        : ''
                    }
                  >
                    Entregue
                  </option>

                  <option
                    value="CANCELLED"
                    ${
                      o.status ===
                      'CANCELLED'
                        ? 'selected'
                        : ''
                    }
                  >
                    Cancelado
                  </option>

                  <option
                    value="REJECTED"
                    ${
                      o.status ===
                      'REJECTED'
                        ? 'selected'
                        : ''
                    }
                  >
                    Rejeitado
                  </option>
                </select>
              </div>
            </div>
          `
        )
        .join('') ||
      '<p class="text-gray-400">Nenhum pedido.</p>';
  }

  async function viewOrder(id) {
    try {
      const o = await api(
        `/orders/${id}`
      );

      document.getElementById(
        'order-detail'
      ).innerHTML = `
        <div class="flex justify-between items-start gap-4">
          <div>
            <h3 class="font-bold text-xl">
              Pedido ${esc(o.id)}
            </h3>

            <p class="text-xs text-gray-500">
              ${new Date(
                o.createdAt
              ).toLocaleString(
                'pt-PT'
              )}
            </p>
          </div>

          <button
            onclick="document.getElementById('order-modal').classList.add('hidden')"
            class="text-xl"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div class="grid grid-cols-2 gap-3 my-5 text-sm">
          <div>
            <span class="text-gray-400">
              Cliente
            </span>
            <p>
              ${esc(
                o.customerName || '—'
              )}
            </p>
          </div>

          <div>
            <span class="text-gray-400">
              Telefone
            </span>
            <p>
              ${esc(
                o.customerPhone || '—'
              )}
            </p>
          </div>

          <div>
            <span class="text-gray-400">
              Entrega
            </span>
            <p>
              ${
                o.fulfillmentMethod ===
                'PICKUP'
                  ? 'Retirada na loja'
                  : 'Entrega'
              }
            </p>
          </div>

          <div>
            <span class="text-gray-400">
              Estado
            </span>
            <p>
              ${esc(o.status)}
            </p>
          </div>
        </div>

        <div class="border-y py-3 space-y-2">
          ${o.items
            .map(
              i => `
                <div class="flex justify-between gap-3 text-sm">
                  <span>
                    ${esc(
                      i.productNameSnapshot
                    )}
                    ·
                    ${esc(i.size)}
                    ·
                    ${i.quantity}x
                  </span>

                  <strong>
                    ${money(
                      i.subtotal,
                      o.currency
                    )}
                  </strong>
                </div>
              `
            )
            .join('')}
        </div>

        <div class="text-right mt-4">
          <p class="text-sm text-gray-500">
            Subtotal
            ${money(
              o.subtotal,
              o.currency
            )}
          </p>

          <p class="text-sm text-gray-500">
            Entrega
            ${money(
              o.deliveryCost,
              o.currency
            )}
          </p>

          <p class="font-bold text-lg">
            Total
            ${money(
              o.total,
              o.currency
            )}
          </p>
        </div>
      `;

      document
        .getElementById(
          'order-modal'
        )
        ?.classList.remove('hidden');
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function changeStatus(
    id,
    status
  ) {
    try {
      await api(
        `/orders/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status
          })
        }
      );

      await loadAdmin();

      toast('Estado atualizado.');
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function deleteProduct(id) {
    if (
      !confirm(
        'Desativar este produto?'
      )
    ) {
      return;
    }

    try {
      await api(
        `/products/${id}`,
        {
          method: 'DELETE'
        }
      );

      await loadAdmin();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function restoreProduct(id) {
    try {
      await api(
        `/products/${id}/restore`,
        {
          method: 'POST'
        }
      );

      await loadAdmin();

      toast('Produto reativado.');
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function saveSettings() {
    try {
      await api(
        '/settings',
        {
          method: 'PATCH',
          body: JSON.stringify({
            shopName:
              document.getElementById(
                'cfg-name'
              ).value.trim(),

            currency:
              document.getElementById(
                'cfg-currency'
              ).value,

            whatsapp:
              document.getElementById(
                'cfg-whatsapp'
              ).value.trim(),

            deliveryBaseCost:
              Number(
                document.getElementById(
                  'cfg-base'
                ).value
              ),

            deliveryPerKm:
              Number(
                document.getElementById(
                  'cfg-per-km'
                ).value
              ),

            deliveryMaxKm:
              Number(
                document.getElementById(
                  'cfg-max-km'
                ).value
              ),

            deliveryOriginLat:
              Number(
                document.getElementById(
                  'cfg-lat'
                ).value
              ),

            deliveryOriginLng:
              Number(
                document.getElementById(
                  'cfg-lng'
                ).value
              )
          })
        }
      );

      toast(
        'Configurações guardadas.'
      );

      await loadStore();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function saveProduct() {
    const id = document.getElementById('prod-id')?.value || '';

    try {
      const photoInputs = Array.from(document.querySelectorAll('[data-photo-file]'));
      const imageUrls = collectPhotoUrls();

      for (let i = 0; i < photoInputs.length; i++) {
        const file = photoInputs[i]?.files?.[0];
        if (!file) continue;
        if (file.size > 5 * 1024 * 1024) {
          throw new Error(`A imagem ${i + 1} não pode ultrapassar 5 MB.`);
        }
        const uploaded = await uploadImage(file);
        const url = uploaded?.imageUrl || uploaded?.url;
        if (!url) throw new Error(`Não foi possível obter a URL da imagem ${i + 1}.`);
        imageUrls[i] = url;
      }

      const images = imageUrls.filter(Boolean).slice(0, 6);
      const imageUrl = images[0] || '';

      const getStock = size => Number(
        document.getElementById(`stock-${size}`)?.value ??
        document.getElementById(`prod-stock-${size.toLowerCase()}`)?.value ?? 0
      ) || 0;

      const sizes = ['P', 'M', 'G', 'GG'].map(size => ({
        size,
        stock: getStock(size)
      }));

      const body = {
        name: document.getElementById('prod-name')?.value.trim() || '',
        ref: document.getElementById('prod-ref')?.value.trim() || '',
        description: document.getElementById('prod-desc')?.value.trim() || '',
        price: Number(document.getElementById('prod-price')?.value) || 0,
        currency: document.getElementById('prod-currency')?.value || 'MT',
        imageUrl,
        images,
        limited: !!document.getElementById('prod-limited')?.checked,
        sizes
      };

      await api(id ? `/products/${id}` : '/products', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body)
      });

      document.getElementById('prod-modal')?.classList.add('hidden');
      await loadAdmin();
      await loadStore();
      toast('Produto guardado.');
    } catch (e) {
      toast(e.message || 'Não foi possível guardar o produto.', true);
    }
  }

  async function changePassword() {
    try {
      await api(
        '/auth/password/change',
        {
          method: 'POST',
          body: JSON.stringify({
            currentPassword:
              document.getElementById(
                'current-password'
              ).value,

            newPassword:
              document.getElementById(
                'new-password'
              ).value
          })
        }
      );

      document.getElementById(
        'current-password'
      ).value = '';

      document.getElementById(
        'new-password'
      ).value = '';

      toast(
        'Palavra-passe alterada.'
      );
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function start2fa() {
    try {
      const r = await api(
        '/auth/2fa/setup',
        {
          method: 'POST'
        }
      );

      document.getElementById(
        'tfa-secret'
      ).textContent = r.secret;

      document
        .getElementById(
          'tfa-setup'
        )
        ?.classList.remove(
          'hidden'
        );
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function enable2fa() {
    try {
      const r = await api(
        '/auth/2fa/enable',
        {
          method: 'POST',
          body: JSON.stringify({
            code:
              document.getElementById(
                'tfa-enable-code'
              ).value.trim()
          })
        }
      );

      toast(
        '2FA ativado. Guarda os códigos de recuperação.'
      );

      if (r.recoveryCodes) {
        showRecoveryCodes(
          r.recoveryCodes
        );
      }

      await afterLogin();
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function loadRecoveryStatus() {
    try {
      const r = await api(
        '/auth/2fa/recovery/status'
      );

      document.getElementById(
        'recovery-count'
      ).textContent = r.remaining;
    } catch (e) {}
  }

  function showRecoveryCodes(
    codes
  ) {
    const el =
      document.getElementById(
        'recovery-codes'
      );

    if (!el) return;

    el.textContent =
      codes.join('\n');

    el.classList.remove(
      'hidden'
    );
  }

  async function regenerateRecoveryCodes() {
    try {
      const code =
        document.getElementById(
          'recovery-current-code'
        ).value.trim();

      const r = await api(
        '/auth/2fa/recovery/regenerate',
        {
          method: 'POST',
          body: JSON.stringify({
            code
          })
        }
      );

      showRecoveryCodes(
        r.codes
      );

      await loadRecoveryStatus();

      toast(
        'Novos códigos gerados.'
      );
    } catch (e) {
      toast(e.message, true);
    }
  }

  function renderSecurity() {
    const status =
      document.getElementById(
        'security-2fa-status'
      );

    if (status) {
      status.textContent =
        state.user?.twoFactorEnabled
          ? 'ativo'
          : 'inativo';
    }

    if (
      state.user?.twoFactorEnabled
    ) {
      loadRecoveryStatus();
    }
  }

  async function loadAudit() {
    try {
      const rows =
        await api('/audit');

      document.getElementById(
        'audit-list'
      ).innerHTML =
        rows
          .map(
            x => `
              <div class="bg-white border rounded-lg p-3">
                <div class="flex justify-between gap-3">
                  <strong class="text-sm">
                    ${esc(x.action)}
                  </strong>

                  <span class="text-xs text-gray-400">
                    ${new Date(
                      x.createdAt
                    ).toLocaleString(
                      'pt-PT'
                    )}
                  </span>
                </div>

                <p class="text-xs text-gray-500 mt-1">
                  ${esc(x.entity)}
                  ${
                    x.entityId
                      ? ' · ' +
                        esc(
                          x.entityId
                        )
                      : ''
                  }
                </p>
              </div>
            `
          )
          .join('') ||
        '<p class="text-gray-400">Sem eventos.</p>';
    } catch (e) {
      toast(e.message, true);
    }
  }

  function forgotPassword() {
    setPage('reset-page');

    const email =
      document.getElementById(
        'login-email'
      )?.value?.trim();

    if (email) {
      document.getElementById(
        'reset-email'
      ).value = email;
    }
  }

  async function requestReset() {
    try {
      await api(
        '/auth/password/forgot',
        {
          method: 'POST',
          body: JSON.stringify({
            email:
              document.getElementById(
                'reset-email'
              ).value.trim()
          })
        }
      );

      toast(
        'Se o e-mail existir, será enviado um link de recuperação.'
      );
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function completeReset() {
    const token =
      new URLSearchParams(
        location.search
      ).get('reset');

    if (!token) {
      return toast(
        'Link de recuperação inválido.',
        true
      );
    }

    try {
      await api(
        '/auth/password/reset',
        {
          method: 'POST',
          body: JSON.stringify({
            token,
            newPassword:
              document.getElementById(
                'reset-new-password'
              ).value
          })
        }
      );

      history.replaceState(
        {},
        '',
        location.pathname
      );

      toast(
        'Palavra-passe alterada.'
      );

      setPage('login-page');
    } catch (e) {
      toast(e.message, true);
    }
  }

  function editProduct(id) {
    const p = state.adminProducts.find(x => x.id === id);
    if (!p) return;

    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-name').value = p.name || '';
    document.getElementById('prod-ref').value = p.ref || '';
    document.getElementById('prod-desc').value = p.description || '';
    document.getElementById('prod-price').value = p.price ?? '';
    document.getElementById('prod-currency').value = p.currency || state.settings.currency || 'MT';
    document.getElementById('prod-image').value = p.imageUrl || '';
    document.getElementById('prod-limited').checked = !!p.limited;

    for (const size of ['P', 'M', 'G', 'GG']) {
      const value = p.sizes?.find(x => x.size === size)?.stock || 0;
      const el = document.getElementById(`stock-${size}`) || document.getElementById(`prod-stock-${size.toLowerCase()}`);
      if (el) el.value = value;
    }

    const images = productImages(p);
    const count = Math.max(1, Math.min(6, images.length || 1));
    const countEl = document.getElementById('prod-image-count');
    if (countEl) countEl.value = String(count);
    renderPhotoInputs(images);

    const title = document.getElementById('prod-modal-title');
    if (title) title.textContent = 'Editar produto';

    document.getElementById('prod-modal')?.classList.remove('hidden');
  }

  function newProduct() {
    document.getElementById('prod-id').value = '';
    document.querySelectorAll('#prod-modal input, #prod-modal textarea').forEach(el => {
      if (el.matches('[data-photo-url]')) return;
      if (el.type === 'checkbox') el.checked = false;
      else if (el.type !== 'file') el.value = '';
    });

    for (const size of ['P', 'M', 'G', 'GG']) {
      const el = document.getElementById(`stock-${size}`) || document.getElementById(`prod-stock-${size.toLowerCase()}`);
      if (el) el.value = '0';
    }

    document.getElementById('prod-currency').value = state.settings.currency || 'MT';

    const countEl = document.getElementById('prod-image-count');
    if (countEl) countEl.value = '1';
    renderPhotoInputs(['']);

    const title = document.getElementById('prod-modal-title');
    if (title) title.textContent = 'Novo produto';

    document.getElementById('prod-modal')?.classList.remove('hidden');
  }


  async function loadPaymentSettings() {
    try {
      const s = await api(
        '/settings/payments'
      );

      document.getElementById(
        'pay-provider'
      ).value = s.provider;

      document.getElementById(
        'pay-wallet'
      ).value =
        s.walletId || '';

      document.getElementById(
        'pay-mpesa'
      ).checked =
        s.mpesaEnabled;

      document.getElementById(
        'pay-emola'
      ).checked =
        s.emolaEnabled;

      const configured =
        s.tokenConfigured &&
        s.webhookSecretConfigured;

      document.getElementById(
        'payment-config-status'
      ).textContent =
        configured
          ? 'Configurado'
          : 'Falta configuração';

      document.getElementById(
        'payment-config-status'
      ).className =
        `text-xs px-2 py-1 rounded ${
          configured
            ? 'bg-emerald-100 text-emerald-700'
            : 'bg-amber-100 text-amber-700'
        }`;
    } catch (e) {
      toast(e.message, true);
    }
  }

  async function savePaymentSettings() {
    try {
      const token =
        document.getElementById(
          'pay-token'
        ).value.trim();

      const webhookSecret =
        document.getElementById(
          'pay-webhook'
        ).value.trim();

      await api(
        '/settings/payments',
        {
          method: 'PATCH',
          body: JSON.stringify({
            provider:
              document.getElementById(
                'pay-provider'
              ).value,

            walletId:
              document.getElementById(
                'pay-wallet'
              ).value.trim(),

            token:
              token || undefined,

            webhookSecret:
              webhookSecret ||
              undefined,

            mpesaEnabled:
              document.getElementById(
                'pay-mpesa'
              ).checked,

            emolaEnabled:
              document.getElementById(
                'pay-emola'
              ).checked
          })
        }
      );

      document.getElementById(
        'pay-token'
      ).value = '';

      document.getElementById(
        'pay-webhook'
      ).value = '';

      toast(
        'Pagamentos automáticos configurados.'
      );

      await loadPaymentSettings();
    } catch (e) {
      toast(e.message, true);
    }
  }

  /*
   * IMPORTANTE:
   * Os botões do HTML usam onclick="..."
   * Portanto estas funções precisam existir
   * no objeto global window.
   */
  window.setPage = setPage;
  window.viewOrder = viewOrder;
  window.openProduct = openProduct;
  window.addToCart = addToCart;
  window.removeCart = removeCart;
  window.openCart = openCart;
  window.setFulfillment =
    setFulfillment;
  window.checkout = checkout;
  window.login = login;
  window.verify2fa = verify2fa;
  window.logout = logout;
  window.switchTab = switchTab;
  window.changeStatus =
    changeStatus;
  window.deleteProduct =
    deleteProduct;
  window.restoreProduct =
    restoreProduct;
  window.saveSettings =
    saveSettings;
  window.saveProduct =
    saveProduct;
  window.editProduct =
    editProduct;
  window.newProduct =
    newProduct;
  window.changePassword =
    changePassword;
  window.start2fa = start2fa;
  window.enable2fa =
    enable2fa;
  window.regenerateRecoveryCodes =
    regenerateRecoveryCodes;
  window.loadAudit = loadAudit;
  window.forgotPassword =
    forgotPassword;
  window.requestReset =
    requestReset;
  window.completeReset =
    completeReset;
  window.loadPaymentSettings =
    loadPaymentSettings;
  window.savePaymentSettings =
    savePaymentSettings;
  window.renderPhotoInputs = renderPhotoInputs;
  window.previewPhoto = previewPhoto;
  window.previewPhotoFile = previewPhotoFile;

  document.addEventListener(
    'DOMContentLoaded',
    async () => {
      if (
        new URLSearchParams(
          location.search
        ).get('reset')
      ) {
        document
          .getElementById(
            'reset-form'
          )
          ?.classList.remove(
            'hidden'
          );
      }

      await loadStore();

      const cfgName =
        document.getElementById(
          'cfg-name'
        );

      if (cfgName) {
        cfgName.value =
          state.settings.shopName ||
          '';
      }

      const cfgCurrency =
        document.getElementById(
          'cfg-currency'
        );

      if (cfgCurrency) {
        cfgCurrency.value =
          state.settings.currency ||
          'MT';
      }

      const cfgWhatsapp =
        document.getElementById(
          'cfg-whatsapp'
        );

      if (cfgWhatsapp) {
        cfgWhatsapp.value =
          state.settings.whatsapp ||
          '';
      }
    }
  );
})();
