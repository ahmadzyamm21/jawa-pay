// Operator prefixes
const PREFIXES = {
    telkomsel: ['0811', '0812', '0813', '0821', '0822', '0852', '0853', '0823'],
    indosat: ['0814', '0815', '0816', '0855', '0856', '0857', '0858'],
    xl: ['0817', '0818', '0819', '0859', '0877', '0878'],
    tri: ['0895', '0896', '0897', '0898', '0899'],
    smartfren: ['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889']
};

// Application State
let state = {
    user: null, // Logged in user info
    balance: 0,
    selectedCategory: 'pulsa',
    targetNumber: '',
    detectedOperator: null, 
    selectedProduct: null,
    selectedPaymentMethod: 'balance',
    transactions: [],
    subCategory: '',
    products: null,
    paymentChannels: [],
    appliedVoucherCode: null,
    voucherDiscount: 0
};

// Global reference for active Tripay checkout
let activeTripayInvoice = null;

// Format currency
function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(value);
}

// Detect Operator from Phone Number prefix
function detectOperator(number) {
    if (number.length < 4) return null;
    const prefix = number.substring(0, 4);
    for (const [operator, list] of Object.entries(PREFIXES)) {
        if (list.includes(prefix)) {
            return operator;
        }
    }
    return null;
}

// UI Elements Cache
const DOM = {
    // Auth elements
    authContainer: document.getElementById('auth-container'),
    landingContainer: document.getElementById('landing-container'),
    mainAppContainer: document.getElementById('main-app-container'),
    loginFormBox: document.getElementById('login-form-box'),
    registerFormBox: document.getElementById('register-form-box'),
    linkToRegister: document.getElementById('link-to-register'),
    linkToLogin: document.getElementById('link-to-login'),
    
    // Auth Inputs
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    btnLoginSubmit: document.getElementById('btn-login-submit'),
    
    registerName: document.getElementById('register-name'),
    registerUsername: document.getElementById('register-username'),
    registerEmail: document.getElementById('register-email'),
    registerPassword: document.getElementById('register-password'),
    btnRegisterSubmit: document.getElementById('btn-register-submit'),
    
    // Profile Header
    agentName: document.getElementById('agent-name'),
    balanceValue: document.getElementById('balance-value'),
    btnTopup: document.getElementById('btn-topup'),
    btnLogout: document.getElementById('btn-logout'),
    
    // Core App
    tabBtns: document.querySelectorAll('.tab-btn'),
    targetInput: document.getElementById('target-number'),
    inputLabel: document.getElementById('input-label'),
    operatorBadge: document.getElementById('operator-badge'),
    productsGrid: document.getElementById('products-grid'),
    checkoutBox: document.getElementById('checkout-box'),
    checkoutCardName: document.getElementById('checkout-card-name'),
    checkoutCardTarget: document.getElementById('checkout-card-target'),
    checkoutPriceAgent: document.getElementById('checkout-price-agent'),
    checkoutPriceSell: document.getElementById('checkout-price-sell'),
    checkoutProfit: document.getElementById('checkout-profit'),
    checkoutTotal: document.getElementById('checkout-total'),
    paymentMethodsList: document.getElementById('payment-methods-list'),
    btnPay: document.getElementById('btn-pay'),
    historyList: document.getElementById('history-list'),
    
    // Modals
    topupModal: document.getElementById('topup-modal'),
    btnSaveTopup: document.getElementById('btn-save-topup'),
    topupAmountInput: document.getElementById('topup-amount'),
    
    qrisModal: document.getElementById('qris-modal'),
    qrisTimer: document.getElementById('qris-timer'),
    qrisAmount: document.getElementById('qris-amount'),
    btnSimulatePay: document.getElementById('btn-simulate-pay'),
    
    receiptModal: document.getElementById('receipt-modal'),
    receiptShopName: document.getElementById('receipt-shop-name'),
    receiptTrxId: document.getElementById('receipt-trx-id'),
    receiptTime: document.getElementById('receipt-time'),
    receiptTarget: document.getElementById('receipt-target'),
    receiptProduct: document.getElementById('receipt-product'),
    receiptPrice: document.getElementById('receipt-price'),
    receiptPayment: document.getElementById('receipt-payment'),
    receiptStatus: document.getElementById('receipt-status'),
    btnPrintReceipt: document.getElementById('btn-print-receipt'),
    btnCloseReceipt: document.getElementById('btn-close-receipt'),

    // Receipt customization elements
    receiptHeaderInput: document.getElementById('receipt-header-input'),
    receiptFooterInput: document.getElementById('receipt-footer-input'),
    receiptWidthSelect: document.getElementById('receipt-width-select'),
    receiptShopName: document.getElementById('receipt-shop-name'),
    receiptFooterText: document.getElementById('receipt-footer-text'),

    // Settings modal
    btnSettings: document.getElementById('btn-settings'),
    settingsModal: document.getElementById('settings-modal'),
    settingsMarkupInput: document.getElementById('settings-markup-input'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    settingsThemeDark: document.getElementById('settings-theme-dark'),
    settingsThemeLight: document.getElementById('settings-theme-light'),

    // E-money and Game selection filters
    subCategoryWrapper: document.getElementById('subcategory-wrapper'),
    subCategorySelect: document.getElementById('subcategory-select'),
    subCategoryLabel: document.getElementById('subcategory-label'),

    // Voucher elements
    voucherInput: document.getElementById('checkout-voucher-code'),
    btnApplyVoucher: document.getElementById('btn-apply-voucher'),
    voucherStatusMsg: document.getElementById('voucher-status-msg'),
    discountRow: document.getElementById('checkout-discount-row'),
    discountVal: document.getElementById('checkout-discount-val'),
};

// ---------------- AUTHENTICATION CLIENT FLOW ----------------

function getToken() {
    return localStorage.getItem('jawapay_token');
}

// Check auth status on load
async function checkAuth() {
    const token = getToken();
    if (token) {
        // Fetch user profile from API
        try {
            const res = await fetch('/api/auth/profile', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const profile = await res.json();
                state.user = { id: profile.id, name: profile.name, username: profile.username };
                state.balance = profile.balance;
                state.transactions = profile.transactions;
                
                // Show dashboard
                DOM.authContainer.style.display = 'none';
                DOM.landingContainer.style.display = 'none';
                DOM.mainAppContainer.style.display = 'block';
                
                // Render details
                DOM.agentName.textContent = state.user.name;
                DOM.balanceValue.textContent = formatRupiah(state.balance);
                renderTransactions();
                
                // Initialize core app components
                await fetchProducts();
                await fetchPaymentChannels();
                renderProducts();
            } else {
                // Invalid token
                logout();
            }
        } catch (err) {
            console.error('Koneksi autentikasi gagal:', err);
            logout();
        }
    } else {
        // Go straight to login page by default
        DOM.landingContainer.style.display = 'none';
        DOM.mainAppContainer.style.display = 'none';
        DOM.authContainer.style.display = 'block';
        DOM.loginFormBox.style.display = 'block';
        DOM.registerFormBox.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
}

// Login
async function handleLogin() {
    const username = DOM.loginUsername.value.trim();
    const password = DOM.loginPassword.value;

    if (!username || !password) {
        alert('Silakan masukkan username dan password Anda.');
        return;
    }

    DOM.btnLoginSubmit.disabled = true;
    DOM.btnLoginSubmit.innerHTML = '⏳ Menghubungkan...';

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok && result.token) {
            localStorage.setItem('jawapay_token', result.token);
            // Clear inputs
            DOM.loginUsername.value = '';
            DOM.loginPassword.value = '';
            // Load app
            await checkAuth();
        } else {
            alert('Gagal Masuk: ' + (result.error || 'Username atau password salah.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungkan ke server.');
    } finally {
        DOM.btnLoginSubmit.disabled = false;
        DOM.btnLoginSubmit.innerHTML = '<i data-lucide="log-in" style="width: 18px; height: 18px;"></i> Masuk Sekarang';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Register
async function handleRegister() {
    const name = DOM.registerName.value.trim();
    const username = DOM.registerUsername.value.trim();
    const email = DOM.registerEmail.value.trim();
    const password = DOM.registerPassword.value;

    if (!name || !username || !email || !password) {
        alert('Silakan isi seluruh formulir pendaftaran.');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Format alamat email tidak valid.');
        return;
    }

    DOM.btnRegisterSubmit.disabled = true;
    DOM.btnRegisterSubmit.innerHTML = '⏳ Mendaftarkan...';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, username, password, email })
        });

        const result = await response.json();

        if (response.ok) {
            alert(result.message || 'Registrasi Berhasil! Silakan cek email Anda untuk melakukan verifikasi sebelum login.');
            // Clear inputs
            DOM.registerName.value = '';
            DOM.registerUsername.value = '';
            DOM.registerEmail.value = '';
            DOM.registerPassword.value = '';
            // Toggle back to login
            DOM.registerFormBox.style.display = 'none';
            DOM.loginFormBox.style.display = 'block';
        } else {
            alert('Registrasi Gagal: ' + (result.error || 'Username sudah digunakan.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungkan ke server.');
    } finally {
        DOM.btnRegisterSubmit.disabled = false;
        DOM.btnRegisterSubmit.innerHTML = '<i data-lucide="user-plus" style="width: 18px; height: 18px;"></i> Daftar Sekarang';
        if (window.lucide) window.lucide.createIcons();
    }
}

function logout() {
    localStorage.removeItem('jawapay_token');
    state.user = null;
    state.balance = 0;
    state.transactions = [];
    DOM.landingContainer.style.display = 'none';
    DOM.mainAppContainer.style.display = 'none';
    DOM.authContainer.style.display = 'block';
    DOM.loginFormBox.style.display = 'block';
    DOM.registerFormBox.style.display = 'none';
    if (window.lucide) window.lucide.createIcons();
}

// ---------------- CORE UTILITIES & API SYNC ----------------

function getMarkupFlat() {
    if (!state.user || state.user.markupFlat === null || state.user.markupFlat === undefined) {
        return 1500;
    }
    return state.user.markupFlat;
}

async function fetchBalance() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/api/balance', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        state.balance = data.balance;
        DOM.balanceValue.textContent = formatRupiah(state.balance);
    } catch (err) {
        console.error(err);
    }
}

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        state.products = await res.json();
    } catch (err) {
        console.error(err);
    }
}

async function fetchPaymentChannels() {
    try {
        const res = await fetch('/api/payment-channels');
        state.paymentChannels = await res.json();
        renderPaymentChannels();
    } catch (err) {
        console.error(err);
    }
}

// Render payment methods dynamically
function renderPaymentChannels() {
    DOM.paymentMethodsList.innerHTML = '';
    
    // 1. Add Agent Wallet
    const balCard = document.createElement('div');
    balCard.className = `payment-method-card ${state.selectedPaymentMethod === 'balance' ? 'selected' : ''}`;
    balCard.dataset.method = 'balance';
    balCard.innerHTML = `
        <i data-lucide="wallet" style="width: 16px; height: 16px; margin-bottom: 2px;"></i>
        <span class="payment-name">Saldo Agen</span>
    `;
    balCard.addEventListener('click', () => selectPaymentMethod('balance', balCard));
    DOM.paymentMethodsList.appendChild(balCard);

    // 2. Add Midtrans Snap Gate
    const midCard = document.createElement('div');
    midCard.className = `payment-method-card ${state.selectedPaymentMethod === 'midtrans' ? 'selected' : ''}`;
    midCard.dataset.method = 'midtrans';
    midCard.innerHTML = `
        <i data-lucide="credit-card" style="width: 16px; height: 16px; margin-bottom: 2px;"></i>
        <span class="payment-name">Midtrans Snap</span>
    `;
    midCard.addEventListener('click', () => selectPaymentMethod('midtrans', midCard));
    DOM.paymentMethodsList.appendChild(midCard);

    if (window.lucide) window.lucide.createIcons();
}

function selectPaymentMethod(method, cardElement) {
    document.querySelectorAll('.payment-method-card').forEach(c => c.classList.remove('selected'));
    cardElement.classList.add('selected');
    state.selectedPaymentMethod = method;
    
    updateCheckoutTotalDisplay();
}

function renderProducts() {
    DOM.productsGrid.innerHTML = '';
    
    if (!state.products) {
        DOM.productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1; color: #ef4444;">
                <div>⚠️</div>
                <p>Gagal memuat produk. Pastikan server backend Anda berjalan.</p>
            </div>
        `;
        return;
    }

    let productsToShow = [];
    const cat = state.selectedCategory;

    if (cat === 'pulsa' || cat === 'data') {
        if (state.detectedOperator) {
            productsToShow = state.products[cat][state.detectedOperator] || [];
        }
    } else if (cat === 'pln') {
        productsToShow = state.products.pln.global || [];
    } else if (cat === 'emoney' || cat === 'game') {
        const sub = state.subCategory;
        if (sub && state.products[cat] && state.products[cat][sub]) {
            productsToShow = state.products[cat][sub];
        }
    }

    if (productsToShow.length === 0) {
        let msg = 'Silakan masukkan nomor HP tujuan terlebih dahulu';
        if (cat === 'pln') msg = 'Silakan masukkan No. Meteran / ID Pelanggan';
        if (cat === 'emoney') msg = 'Pilih jenis E-Wallet terlebih dahulu';
        if (cat === 'game') msg = 'Pilih jenis Game terlebih dahulu';

        DOM.productsGrid.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <div class="empty-icon">📱</div>
                <p>${msg}</p>
            </div>
        `;
        DOM.checkoutBox.style.display = 'none';
        state.selectedProduct = null;
        updatePayButtonState();
        return;
    }

    productsToShow.forEach(prod => {
        const card = document.createElement('div');
        card.className = `product-card ${state.selectedProduct?.buyer_sku_code === prod.buyer_sku_code ? 'selected' : ''}`;
        card.innerHTML = `
            <div>
                <div class="product-title">${prod.name}</div>
                <div class="product-desc">${prod.desc}</div>
            </div>
            <div class="price-container">
                <div>
                    <div style="font-size: 9px; color: var(--text-muted);">HARGA AGEN</div>
                    <div class="price-agent">${formatRupiah(prod.priceAgent)}</div>
                </div>
                <div>
                    <div style="font-size: 9px; color: var(--text-secondary); text-align: right;">HARGA JUAL</div>
                    <div class="price-sell">${formatRupiah(prod.priceAgent + getMarkupFlat())}</div>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            document.querySelectorAll('.product-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectProduct(prod);
        });

        DOM.productsGrid.appendChild(card);
    });
}

function selectProduct(product) {
    state.selectedProduct = product;
    DOM.checkoutBox.style.display = 'flex';
    DOM.checkoutCardName.textContent = product.name;
    DOM.checkoutCardTarget.textContent = state.targetNumber || '-';
    DOM.checkoutPriceAgent.textContent = formatRupiah(product.priceAgent);
    
    const markup = getMarkupFlat();
    const calculatedSell = product.priceAgent + markup;
    DOM.checkoutPriceSell.textContent = formatRupiah(calculatedSell);
    DOM.checkoutProfit.textContent = formatRupiah(markup);
    
    // Clear voucher input and state when new product is selected
    state.appliedVoucherCode = null;
    state.voucherDiscount = 0;
    if (DOM.voucherInput) DOM.voucherInput.value = '';
    if (DOM.discountRow) DOM.discountRow.style.display = 'none';
    if (DOM.voucherStatusMsg) DOM.voucherStatusMsg.style.display = 'none';

    updateCheckoutTotalDisplay();
    updatePayButtonState();
}

function updatePayButtonState() {
    const hasTarget = state.targetNumber.length >= (state.selectedCategory === 'pln' ? 11 : 10);
    const hasProduct = state.selectedProduct !== null;
    DOM.btnPay.disabled = !(hasTarget && hasProduct);
}

// Setup Event Listeners
function setupListeners() {
    // Login and register switches
    DOM.linkToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.loginFormBox.style.display = 'none';
        DOM.registerFormBox.style.display = 'block';
    });
    DOM.linkToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        DOM.registerFormBox.style.display = 'none';
        DOM.loginFormBox.style.display = 'block';
    });

    // Back to landing page action
    document.querySelectorAll('.link-back-to-landing-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            DOM.authContainer.style.display = 'none';
            DOM.landingContainer.style.display = 'block';
            fetchLandingPrices();
        });
    });

    // Auth actions
    DOM.btnLoginSubmit.addEventListener('click', handleLogin);
    DOM.btnRegisterSubmit.addEventListener('click', handleRegister);
    DOM.btnLogout.addEventListener('click', logout);

    // Terms & Privacy modals
    const linkTerms = document.getElementById('link-terms');
    const linkPrivacy = document.getElementById('link-privacy');
    const termsModal = document.getElementById('terms-modal');
    const privacyModal = document.getElementById('privacy-modal');
    const btnCloseTerms = document.getElementById('btn-close-terms');
    const btnClosePrivacy = document.getElementById('btn-close-privacy');

    if (linkTerms) {
        linkTerms.addEventListener('click', (e) => {
            e.preventDefault();
            termsModal.classList.add('show');
        });
    }
    if (linkPrivacy) {
        linkPrivacy.addEventListener('click', (e) => {
            e.preventDefault();
            privacyModal.classList.add('show');
        });
    }
    if (btnCloseTerms) {
        btnCloseTerms.addEventListener('click', () => {
            termsModal.classList.remove('show');
        });
    }
    if (btnClosePrivacy) {
        btnClosePrivacy.addEventListener('click', () => {
            privacyModal.classList.remove('show');
        });
    }
    [termsModal, privacyModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        }
    });

    // Categories tab click
    DOM.tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const category = btn.dataset.category;
            state.selectedCategory = category;
            state.selectedProduct = null;
            state.detectedOperator = null;
            DOM.operatorBadge.className = 'operator-badge';
            DOM.operatorBadge.textContent = '';
            
            DOM.subCategoryWrapper.style.display = 'none';
            if (category === 'pulsa' || category === 'data') {
                DOM.inputLabel.textContent = 'Nomor Handphone Tujuan';
                DOM.targetInput.placeholder = 'Contoh: 081234567890';
                DOM.targetInput.type = 'tel';
                handleNumberInput(DOM.targetInput.value);
            } else if (category === 'pln') {
                DOM.inputLabel.textContent = 'No. Meter / ID Pelanggan';
                DOM.targetInput.placeholder = 'Contoh: 14038294719';
                DOM.targetInput.type = 'number';
                state.detectedOperator = 'pln';
                DOM.operatorBadge.className = 'operator-badge show badge-pln';
                DOM.operatorBadge.textContent = 'PLN';
            } else if (category === 'emoney') {
                DOM.inputLabel.textContent = 'Nomor HP / ID Akun E-Wallet';
                DOM.targetInput.placeholder = 'Contoh: 081234567890';
                DOM.targetInput.type = 'tel';
                setupSubCategorySelect('emoney');
            } else if (category === 'game') {
                DOM.inputLabel.textContent = 'User ID / Zone ID Game';
                DOM.targetInput.placeholder = 'Contoh: 12345678 (2045)';
                DOM.targetInput.type = 'text';
                setupSubCategorySelect('game');
            }

            renderProducts();
        });
    });

    DOM.subCategorySelect.addEventListener('change', (e) => {
        state.subCategory = e.target.value;
        state.selectedProduct = null;
        renderProducts();
    });

    DOM.targetInput.addEventListener('input', (e) => {
        handleNumberInput(e.target.value);
    });

    DOM.btnTopup.addEventListener('click', () => {
        DOM.topupModal.classList.add('show');
    });

    document.querySelectorAll('.topup-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            DOM.topupAmountInput.value = btn.dataset.amount;
        });
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            closeAllModals();
        });
    });

    DOM.btnSaveTopup.addEventListener('click', async () => {
        const amount = parseFloat(DOM.topupAmountInput.value);
        if (amount > 0) {
            // Locally simulate increment
            state.balance += amount;
            DOM.balanceValue.textContent = formatRupiah(state.balance);
            closeAllModals();
            alert(`Berhasil menambahkan saldo sebesar ${formatRupiah(amount)} (Simulasi)`);
        }
    });

    DOM.btnPay.addEventListener('click', () => {
        processPayment();
    });

    DOM.btnSimulatePay.addEventListener('click', () => {
        simulateWebhookCallback();
    });

    DOM.btnCloseReceipt.addEventListener('click', () => {
        DOM.receiptModal.classList.remove('show');
    });

    DOM.btnPrintReceipt.addEventListener('click', () => {
        window.print();
    });

    // Navigation Tabs & Analitik
    const navTransaction = document.getElementById('nav-transaction');
    const navAnalytics = document.getElementById('nav-analytics');
    const viewTransaction = document.getElementById('view-transaction');
    const viewAnalytics = document.getElementById('view-analytics');
    const btnExportCSV = document.getElementById('btn-export-csv');

    if (navTransaction && navAnalytics) {
        navTransaction.addEventListener('click', () => {
            navTransaction.classList.add('active');
            navAnalytics.classList.remove('active');
            viewTransaction.style.display = 'block';
            viewAnalytics.style.display = 'none';
        });

        navAnalytics.addEventListener('click', () => {
            navAnalytics.classList.add('active');
            navTransaction.classList.remove('active');
            viewTransaction.style.display = 'none';
            viewAnalytics.style.display = 'flex';
            
            updateAnalyticsDashboard();
        });
    }

    if (btnExportCSV) {
        btnExportCSV.addEventListener('click', exportToCSV);
    }

    // Settings actions
    if (DOM.btnSettings) {
        DOM.btnSettings.addEventListener('click', () => {
            if (state.user) {
                DOM.settingsMarkupInput.value = getMarkupFlat();
                
                // Show current settings in modal UI
                const currentTheme = localStorage.getItem('jawapay_theme') || 'dark';
                updateThemeSelectionUI(currentTheme);

                const currentAccent = localStorage.getItem('jawapay_accent') || 'indigo';
                updateAccentSelectionUI(currentAccent);

                DOM.settingsModal.classList.add('show');
            } else {
                alert('Silakan masuk terlebih dahulu.');
            }
        });
    }

    if (DOM.btnSaveSettings) {
        DOM.btnSaveSettings.addEventListener('click', handleSaveSettings);
    }

    if (DOM.settingsThemeDark) {
        DOM.settingsThemeDark.addEventListener('click', () => {
            localStorage.setItem('jawapay_theme', 'dark');
            updateThemeSelectionUI('dark');
            applyThemeAndAccent();
        });
    }

    if (DOM.settingsThemeLight) {
        DOM.settingsThemeLight.addEventListener('click', () => {
            localStorage.setItem('jawapay_theme', 'light');
            updateThemeSelectionUI('light');
            applyThemeAndAccent();
        });
    }

    document.querySelectorAll('.accent-dot-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const selectedAccent = e.target.getAttribute('data-accent');
            localStorage.setItem('jawapay_accent', selectedAccent);
            updateAccentSelectionUI(selectedAccent);
            applyThemeAndAccent();
        });
    });

    // Receipt customization inputs
    if (DOM.receiptHeaderInput) {
        DOM.receiptHeaderInput.addEventListener('input', (e) => {
            DOM.receiptShopName.textContent = e.target.value || 'JAWA PAY DIGITAL';
        });
    }

    if (DOM.receiptFooterInput) {
        DOM.receiptFooterInput.addEventListener('input', (e) => {
            DOM.receiptFooterText.textContent = e.target.value || 'Terima Kasih Telah Bertransaksi';
        });
    }

    if (DOM.receiptWidthSelect) {
        DOM.receiptWidthSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            DOM.receiptPaper.className = `receipt-paper width-${val}`;
        });
    }

    // Landing page action handlers
    const btnGoToLogin = document.getElementById('btn-go-to-login');
    const btnHeroRegister = document.getElementById('btn-hero-register');
    const btnBottomRegister = document.getElementById('btn-bottom-register');
    const linkTermsLand = document.getElementById('link-terms-land');
    const linkPrivacyLand = document.getElementById('link-privacy-land');

    if (btnGoToLogin) {
        btnGoToLogin.addEventListener('click', () => {
            DOM.landingContainer.style.display = 'none';
            DOM.authContainer.style.display = 'block';
            DOM.loginFormBox.style.display = 'block';
            DOM.registerFormBox.style.display = 'none';
        });
    }

    [btnHeroRegister, btnBottomRegister].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                DOM.landingContainer.style.display = 'none';
                DOM.authContainer.style.display = 'block';
                DOM.loginFormBox.style.display = 'none';
                DOM.registerFormBox.style.display = 'block';
            });
        }
    });

    if (linkTermsLand) {
        linkTermsLand.addEventListener('click', (e) => {
            e.preventDefault();
            const termsM = document.getElementById('terms-modal');
            if (termsM) termsM.classList.add('show');
        });
    }

    if (linkPrivacyLand) {
        linkPrivacyLand.addEventListener('click', (e) => {
            e.preventDefault();
            const privacyM = document.getElementById('privacy-modal');
            if (privacyM) privacyM.classList.add('show');
        });
    }

    if (DOM.btnApplyVoucher) {
        DOM.btnApplyVoucher.addEventListener('click', handleApplyVoucher);
    }
}

function setupSubCategorySelect(type) {
    DOM.subCategorySelect.innerHTML = '<option value="">-- Pilih --</option>';
    DOM.subCategoryLabel.textContent = type === 'emoney' ? 'Jenis E-Wallet' : 'Pilih Game';
    
    if (type === 'emoney') {
        DOM.subCategorySelect.innerHTML += `
            <option value="gopay">GoPay</option>
            <option value="ovo">OVO</option>
            <option value="dana">DANA</option>
            <option value="shopeepay">ShopeePay</option>
        `;
    } else {
        DOM.subCategorySelect.innerHTML += `
            <option value="mlbb">Mobile Legends</option>
            <option value="ff">Free Fire</option>
            <option value="pubg">PUBG Mobile</option>
        `;
    }
    DOM.subCategoryWrapper.style.display = 'block';
    state.subCategory = '';
}

function handleNumberInput(val) {
    state.targetNumber = val;
    if (state.selectedProduct) {
        DOM.checkoutCardTarget.textContent = val || '-';
    }

    if (state.selectedCategory === 'pulsa' || state.selectedCategory === 'data') {
        const op = detectOperator(val);
        if (op !== state.detectedOperator) {
            state.detectedOperator = op;
            state.selectedProduct = null;
            if (op) {
                DOM.operatorBadge.className = `operator-badge show badge-${op}`;
                DOM.operatorBadge.textContent = op;
            } else {
                DOM.operatorBadge.className = 'operator-badge';
                DOM.operatorBadge.textContent = '';
            }
            renderProducts();
        }
    }
    updatePayButtonState();
}

function closeAllModals() {
    DOM.topupModal.classList.remove('show');
    DOM.qrisModal.classList.remove('show');
    DOM.receiptModal.classList.remove('show');
    if (DOM.settingsModal) DOM.settingsModal.classList.remove('show');
    const termsM = document.getElementById('terms-modal');
    const privacyM = document.getElementById('privacy-modal');
    if (termsM) termsM.classList.remove('show');
    if (privacyM) privacyM.classList.remove('show');
    clearInterval(qrisTimerInterval);
}

// Payment Flow Execution
async function processPayment() {
    const cost = state.selectedProduct.priceAgent;
    const finalCost = cost - state.voucherDiscount;
    const method = state.selectedPaymentMethod;

    if (method === 'balance') {
        if (state.balance < finalCost) {
            alert('Saldo Agen Anda tidak mencukupi. Silakan lakukan Top Up terlebih dahulu.');
            return;
        }
        
        DOM.btnPay.disabled = true;
        DOM.btnPay.innerHTML = '⚡ Memotong saldo agen...';
        
        await executeDirectTransaction();
    } else {
        DOM.btnPay.disabled = true;
        DOM.btnPay.innerHTML = '💳 Membuat token Midtrans...';
        
        await executeMidtransPaymentRequest();
    }
}

// 1. Direct payment using Agent Balance (Protected API call)
async function executeDirectTransaction() {
    const ref_id = 'REF' + Date.now();
    const token = getToken();
    try {
        const response = await fetch('/api/transaction', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                buyer_sku_code: state.selectedProduct.buyer_sku_code,
                customer_no: state.targetNumber,
                ref_id: ref_id,
                voucherCode: state.appliedVoucherCode
            })
        });

        const result = await response.json();
        
        if (response.ok && result.data) {
            const data = result.data;
            
            // Sync updated balance and transaction history from DB profile
            await syncUserProfile();

            const profit = state.selectedProduct.priceSell - state.selectedProduct.priceAgent;
            const trx = {
                id: data.trx_id,
                time: new Date().toLocaleString('id-ID'),
                category: state.selectedCategory,
                productName: state.selectedProduct.name,
                target: state.targetNumber,
                priceAgent: state.selectedProduct.priceAgent,
                priceSell: state.selectedProduct.priceSell - state.voucherDiscount, // Adjusted by discount
                profit: profit,
                paymentMethod: 'Saldo Agen',
                status: data.status,
                sn: data.sn,
                voucherCode: state.appliedVoucherCode,
                discountApplied: state.voucherDiscount
            };

            showReceipt(trx);
            resetForm();
        } else {
            alert('Transaksi Gagal: ' + (result.error || 'Terjadi kesalahan.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal memproses transaksi.');
    } finally {
        DOM.btnPay.disabled = false;
        DOM.btnPay.innerHTML = '<i data-lucide="send" style="width: 18px; height: 18px;"></i> Proses Pembayaran';
        if (window.lucide) window.lucide.createIcons();
    }
}

// 2. Request Midtrans Payment Invoice (Protected API call)
async function executeMidtransPaymentRequest() {
    const token = getToken();
    const markup = getMarkupFlat();
    const calculatedSell = state.selectedProduct.priceAgent + markup;
    
    // Total gross amount including dynamic Flat Rp 2.000 fee and deducting discount
    const totalAmount = Math.max(0, state.selectedProduct.priceAgent - state.voucherDiscount) + 2000;

    DOM.qrisAmount.textContent = formatRupiah(totalAmount);
    DOM.qrisModal.classList.add('show');

    try {
        const response = await fetch('/api/payment/request', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                method: 'midtrans',
                amount: state.selectedProduct.priceAgent,
                customer_phone: state.targetNumber,
                buyer_sku_code: state.selectedProduct.buyer_sku_code,
                voucherCode: state.appliedVoucherCode
            })
        });

        const result = await response.json();

        if (response.ok && result.token) {
            activeTripayInvoice = {
                merchant_ref: result.merchant_ref,
                buyer_sku_code: state.selectedProduct.buyer_sku_code,
                customer_no: state.targetNumber,
                paymentName: 'Midtrans Snap',
                totalAmount: totalAmount,
                productName: state.selectedProduct.name,
                priceSell: calculatedSell - state.voucherDiscount, // Adjusted by discount
                priceAgent: state.selectedProduct.priceAgent,
                voucherCode: state.appliedVoucherCode,
                discountApplied: state.voucherDiscount
            };

            // Trigger Midtrans Snap Popup
            if (window.snap) {
                window.snap.pay(result.token, {
                    onSuccess: async function(midtransResult) {
                        closeAllModals();
                        alert('Pembayaran Midtrans Berhasil! Memproses pengisian pulsa...');
                        await triggerSimulateSuccess(result.merchant_ref);
                    },
                    onPending: function(midtransResult) {
                        console.log('Payment pending:', midtransResult);
                    },
                    onError: function(midtransResult) {
                        alert('Pembayaran gagal dilakukan.');
                        closeAllModals();
                    },
                    onClose: function() {
                        console.log('Jendela Snap ditutup.');
                    }
                });
            } else {
                console.warn('Midtrans Snap SDK not loaded. Gunakan tombol simulasi di layar.');
            }
        } else {
            alert('Gagal memproses pembayaran: ' + (result.error || 'Terjadi kesalahan.'));
            closeAllModals();
        }
    } catch (err) {
        console.error('Error Midtrans payment:', err);
        alert('Gagal terhubung ke server pembayaran.');
        closeAllModals();
    } finally {
        DOM.btnPay.disabled = false;
        DOM.btnPay.innerHTML = '<i data-lucide="send" style="width: 18px; height: 18px;"></i> Proses Pembayaran';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Helper to auto trigger success locally
async function triggerSimulateSuccess(merchantRef) {
    try {
        await fetch('/api/payment/simulate-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                merchant_ref: merchantRef,
                buyer_sku_code: activeTripayInvoice.buyer_sku_code,
                customer_no: activeTripayInvoice.customer_no
            })
        });
        await syncUserProfile();
        renderTransactions();
    } catch (err) {
        console.error('Auto success trigger failed:', err);
    }
}

// 3. Webhook simulation (Unprotected post as webhook acts outside jwt, verified via invoice mapping)
async function simulateWebhookCallback() {
    if (!activeTripayInvoice) return;
    
    DOM.btnSimulatePay.disabled = true;
    DOM.btnSimulatePay.innerHTML = '⏳ Memproses Callback...';

    try {
        const response = await fetch('/api/payment/simulate-callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                merchant_ref: activeTripayInvoice.merchant_ref,
                buyer_sku_code: activeTripayInvoice.buyer_sku_code,
                customer_no: activeTripayInvoice.customer_no
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            const data = result.data;
            closeAllModals();

            // Sync updated profile transactions and balance
            await syncUserProfile();

            const trx = {
                id: data.trx_id,
                time: new Date().toLocaleString('id-ID'),
                category: state.selectedCategory,
                productName: activeTripayInvoice.productName,
                target: activeTripayInvoice.customer_no,
                priceAgent: activeTripayInvoice.priceAgent,
                priceSell: activeTripayInvoice.priceSell,
                profit: activeTripayInvoice.priceSell - activeTripayInvoice.priceAgent,
                paymentMethod: activeTripayInvoice.paymentName,
                status: data.status,
                sn: data.sn,
                voucherCode: activeTripayInvoice.voucherCode,
                discountApplied: activeTripayInvoice.discountApplied
            };

            showReceipt(trx);
            resetForm();
        } else {
            alert('Gagal memproses callback: ' + (result.error || 'Server error.'));
        }
    } catch (err) {
        console.error(err);
    } finally {
        DOM.btnSimulatePay.disabled = false;
        DOM.btnSimulatePay.innerHTML = '<i data-lucide="check-circle" style="width: 14px; height: 14px;"></i> Simulasikan Pembayaran Sukses';
        if (window.lucide) window.lucide.createIcons();
    }
}

// Helper to pull profile updates (balance & transactions list)
async function syncUserProfile() {
    const token = getToken();
    if (!token) return;
    try {
        const res = await fetch('/api/auth/profile', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const profile = await res.json();
            state.balance = profile.balance;
            state.transactions = profile.transactions;
            DOM.balanceValue.textContent = formatRupiah(state.balance);
            renderTransactions();
        }
    } catch (err) {
        console.error(err);
    }
}

function resetForm() {
    DOM.targetInput.value = '';
    state.targetNumber = '';
    state.selectedProduct = null;
    if (state.selectedCategory !== 'pln') {
        state.detectedOperator = null;
        DOM.operatorBadge.className = 'operator-badge';
    }
    renderProducts();
    DOM.checkoutBox.style.display = 'none';
    document.getElementById('checkout-empty-state').style.display = 'flex';
    activeTripayInvoice = null;
}

function renderTransactions() {
    DOM.historyList.innerHTML = '';
    if (!state.transactions || state.transactions.length === 0) {
        DOM.historyList.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                    Belum ada riwayat transaksi
                </td>
            </tr>
        `;
        return;
    }

    state.transactions.forEach(trx => {
        const tr = document.createElement('tr');
        const displayTime = trx.time || (trx.createdAt ? new Date(trx.createdAt).toLocaleString('id-ID') : '-');
        tr.innerHTML = `
            <td style="font-weight: 600;">${trx.id}</td>
            <td style="font-size: 12px; color: var(--text-secondary);">${displayTime}</td>
            <td>
                <div style="font-weight: 500;">${trx.productName}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${trx.target}</div>
            </td>
            <td>${formatRupiah(trx.priceSell)}</td>
            <td class="text-success" style="font-weight: 600;">+${formatRupiah(trx.profit)}</td>
            <td>
                <span class="status-badge status-${trx.status.toLowerCase() === 'sukses' ? 'success' : (trx.status.toLowerCase() === 'pending' ? 'pending' : 'failed')}">
                    ${trx.status}
                </span>
            </td>
        `;

        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => {
            showReceipt(trx);
        });

        DOM.historyList.appendChild(tr);
    });
}

function showReceipt(trx) {
    DOM.receiptTrxId.textContent = trx.id;
    DOM.receiptTime.textContent = trx.time || (trx.createdAt ? new Date(trx.createdAt).toLocaleString('id-ID') : '-');
    DOM.receiptTarget.textContent = trx.target;
    DOM.receiptProduct.textContent = trx.productName;
    DOM.receiptPrice.textContent = formatRupiah(trx.priceSell);
    DOM.receiptPayment.textContent = trx.paymentMethod;
    DOM.receiptStatus.textContent = trx.status;
    
    // Initialize customization preview inputs with defaults
    if (DOM.receiptHeaderInput) DOM.receiptHeaderInput.value = 'JAWA PAY DIGITAL';
    if (DOM.receiptFooterInput) DOM.receiptFooterInput.value = 'Terima Kasih Telah Bertransaksi';
    if (DOM.receiptWidthSelect) DOM.receiptWidthSelect.value = '58mm';
    if (DOM.receiptShopName) DOM.receiptShopName.textContent = 'JAWA PAY DIGITAL';
    if (DOM.receiptFooterText) DOM.receiptFooterText.textContent = 'Terima Kasih Telah Bertransaksi';
    if (DOM.receiptPaper) DOM.receiptPaper.className = 'receipt-paper width-58mm';

    const snRowId = 'receipt-sn-row';
    let snRow = document.getElementById(snRowId);
    if (snRow) snRow.remove();

    if (trx.sn && trx.sn !== '-') {
        snRow = document.createElement('div');
        snRow.id = snRowId;
        snRow.className = 'receipt-row';
        snRow.innerHTML = `<span>SN / Keterangan:</span><span class="receipt-val" style="font-size: 10px;">${trx.sn}</span>`;
        
        const statusRow = DOM.receiptStatus.closest('.receipt-row');
        statusRow.parentNode.insertBefore(snRow, statusRow);
    }

    // Dynamic voucher discount display on receipt
    const discountRowId = 'receipt-discount-row';
    let discountRow = document.getElementById(discountRowId);
    if (discountRow) discountRow.remove();

    if (trx.discountApplied && trx.discountApplied > 0) {
        discountRow = document.createElement('div');
        discountRow.id = discountRowId;
        discountRow.className = 'receipt-row';
        discountRow.style.fontSize = '12px';
        discountRow.style.color = '#059669';
        discountRow.innerHTML = `<span>Diskon Voucher (${trx.voucherCode}):</span><span class="receipt-val">-${formatRupiah(trx.discountApplied)}</span>`;
        
        const totalBox = DOM.receiptPrice.closest('.receipt-total-box');
        totalBox.parentNode.insertBefore(discountRow, totalBox);
    }

    DOM.receiptModal.classList.add('show');
}

// Global Chart.js Instance
let myChartInstance = null;

// Update Stats summary and Chart
function updateAnalyticsDashboard() {
    calculateStats();
    renderProfitChart();
}

function calculateStats() {
    const successTrx = state.transactions.filter(t => t.status === 'Sukses');
    
    let totalTrxCount = successTrx.length;
    let totalRevenue = 0;
    let totalProfit = 0;

    successTrx.forEach(trx => {
        totalRevenue += trx.priceSell;
        totalProfit += trx.profit;
    });

    document.getElementById('stats-total-trx').textContent = totalTrxCount;
    document.getElementById('stats-total-revenue').textContent = formatRupiah(totalRevenue);
    document.getElementById('stats-total-profit').textContent = formatRupiah(totalProfit);
}

function renderProfitChart() {
    const ctx = document.getElementById('profitChart');
    if (!ctx) return;

    const successTrx = [...state.transactions]
        .filter(t => t.status === 'Sukses')
        .reverse(); // Urutkan dari terlama ke terbaru

    const labels = successTrx.map(t => t.id);
    const dataPoints = successTrx.map(t => t.profit);

    if (myChartInstance) {
        myChartInstance.destroy();
    }

    // Default empty state in chart
    if (successTrx.length === 0) {
        myChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Belum Ada Transaksi'],
                datasets: [{
                    label: 'Keuntungan (Rp)',
                    data: [0],
                    borderColor: '#6366f1',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
        return;
    }

    // Render Neon line chart
    myChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Keuntungan (Rp)',
                data: dataPoints,
                borderColor: '#818cf8',
                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#a855f7',
                pointBorderColor: '#ffffff',
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Outfit'
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Outfit'
                        }
                    }
                }
            }
        }
    });
}

function exportToCSV() {
    if (state.transactions.length === 0) {
        alert('Belum ada transaksi untuk diekspor.');
        return;
    }

    // Build CSV Content
    let csvContent = 'ID Transaksi,Waktu,Kategori,Nama Produk,Tujuan,Harga Agen,Harga Jual,Profit,Metode Pembayaran,Status,SN\n';
    
    state.transactions.forEach(trx => {
        const row = [
            trx.id,
            `"${trx.time}"`,
            trx.category || 'N/A',
            `"${trx.productName}"`,
            `"${trx.target}"`,
            trx.priceAgent,
            trx.priceSell,
            trx.profit,
            trx.paymentMethod || '-',
            trx.status,
            `"${trx.sn || '-'}"`
        ];
        csvContent += row.join(',') + '\n';
    });

    // Download Trigger
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Laporan_Penjualan_${state.user ? state.user.username : 'Agen'}_${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function handleSaveSettings() {
    const markupFlat = parseInt(DOM.settingsMarkupInput.value);
    if (isNaN(markupFlat) || markupFlat < 0) {
        alert('Masukkan nominal markup yang valid (lebih dari atau sama dengan 0).');
        return;
    }

    DOM.btnSaveSettings.disabled = true;
    DOM.btnSaveSettings.innerHTML = '⏳ Menyimpan...';

    try {
        const response = await fetch('/api/auth/profile/update-markup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ markupFlat })
        });

        const result = await response.json();

        if (response.ok) {
            state.user.markupFlat = result.markupFlat;
            alert('Setelan harga jual berhasil disimpan! Seluruh harga produk disesuaikan.');
            closeAllModals();
            renderProducts();
            
            // If there's an active selected product, update the checkout box as well
            if (state.selectedProduct) {
                selectProduct(state.selectedProduct);
            }
        } else {
            alert('Gagal menyimpan: ' + (result.error || 'Terjadi kesalahan.'));
        }
    } catch (err) {
        console.error(err);
        alert('Gagal menghubungi server.');
    } finally {
        DOM.btnSaveSettings.disabled = false;
        DOM.btnSaveSettings.innerHTML = '<i data-lucide="save" style="width: 18px; height: 18px;"></i> Simpan Setelan';
        if (window.lucide) window.lucide.createIcons();
    }
}

function applyThemeAndAccent() {
    const currentTheme = localStorage.getItem('jawapay_theme') || 'dark';
    const currentAccent = localStorage.getItem('jawapay_accent') || 'indigo';

    // Apply Theme
    if (currentTheme === 'light') {
        document.documentElement.classList.add('light-theme');
    } else {
        document.documentElement.classList.remove('light-theme');
    }

    // Apply Accent
    document.documentElement.classList.remove('accent-indigo', 'accent-emerald', 'accent-sunset', 'accent-ocean');
    document.documentElement.classList.add(`accent-${currentAccent}`);
}

function updateThemeSelectionUI(theme) {
    if (DOM.settingsThemeLight && DOM.settingsThemeDark) {
        if (theme === 'light') {
            DOM.settingsThemeLight.classList.add('active');
            DOM.settingsThemeDark.classList.remove('active');
        } else {
            DOM.settingsThemeDark.classList.add('active');
            DOM.settingsThemeLight.classList.remove('active');
        }
    }
}

function updateAccentSelectionUI(accent) {
    document.querySelectorAll('.accent-dot-btn').forEach(btn => {
        if (btn.getAttribute('data-accent') === accent) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

async function loadMidtransScript() {
    try {
        const res = await fetch('/api/config/payment');
        const config = await res.json();
        
        // Sembunyikan info akun uji coba secara otomatis di mode produksi
        if (config.isProduction) {
            const credentialsBox = document.getElementById('reviewer-credentials-box');
            if (credentialsBox) {
                credentialsBox.style.display = 'none';
            }
        }

        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = config.isProduction 
            ? 'https://app.midtrans.com/snap/snap.js' 
            : 'https://app.sandbox.midtrans.com/snap/snap.js';
        script.setAttribute('data-client-key', config.clientKey);
        document.head.appendChild(script);
        console.log(`[Midtrans] Loaded dynamically in ${config.isProduction ? 'PRODUCTION' : 'SANDBOX'} mode.`);
    } catch (err) {
        console.error('Failed to load Midtrans script:', err);
    }
}

// ---------------- LANDING PAGE PRICING LOADER ----------------

let landingProducts = null;
let currentLandingCategory = 'pulsa';
let currentLandingOperator = null;

async function fetchLandingPrices() {
    try {
        const res = await fetch('/api/products');
        if (res.ok) {
            landingProducts = await res.json();
            renderLandingCategoryTabs();
            renderLandingPrices();
        } else {
            console.error('Gagal mengambil harga produk untuk landing page.');
        }
    } catch (err) {
        console.error('Koneksi katalog landing page gagal:', err);
    }
}

function renderLandingCategoryTabs() {
    // Add event listeners to category tabs
    document.querySelectorAll('#landing-tabs button').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#landing-tabs button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLandingCategory = btn.getAttribute('data-landcat');
            currentLandingOperator = null; // Reset operator choice
            renderLandingPrices();
        };
    });
}

function renderLandingPrices() {
    const operatorContainer = document.getElementById('landing-operators');
    const rowsContainer = document.getElementById('landing-price-rows');
    if (!rowsContainer || !landingProducts) return;
    
    // Get products for the selected category
    const categoryData = landingProducts[currentLandingCategory];
    if (!categoryData) {
        rowsContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary);">Produk tidak tersedia</td></tr>';
        operatorContainer.innerHTML = '';
        return;
    }
    
    // For categories that have brands/operators
    let operators = [];
    let productsToRender = [];
    
    if (currentLandingCategory === 'pln') {
        operatorContainer.innerHTML = ''; // PLN doesn't need operator dots
        productsToRender = categoryData.global || [];
    } else {
        operators = Object.keys(categoryData);
        
        // Render operator dots/pills selector
        operatorContainer.innerHTML = '';
        if (operators.length > 0) {
            if (!currentLandingOperator || !operators.includes(currentLandingOperator)) {
                currentLandingOperator = operators[0];
            }
            
            const friendlyNames = {
                telkomsel: 'TELKOMSEL',
                indosat: 'INDOSAT OOREDOO',
                xl: 'XL AXIATA',
                axis: 'AXIS',
                tri: 'TRI (3)',
                smartfren: 'SMARTFREN',
                gopay: 'GOPAY',
                ovo: 'OVO',
                dana: 'DANA',
                shopeepay: 'SHOPEEPAY'
            };
            
            operators.forEach(op => {
                const btn = document.createElement('button');
                btn.className = `operator-pill-btn ${op === currentLandingOperator ? 'active' : ''}`;
                btn.textContent = friendlyNames[op] || op.toUpperCase();
                btn.onclick = () => {
                    currentLandingOperator = op;
                    renderLandingPrices();
                };
                operatorContainer.appendChild(btn);
            });
            
            productsToRender = categoryData[currentLandingOperator] || [];
        }
    }
    
    // Render rows
    rowsContainer.innerHTML = '';
    if (productsToRender.length === 0) {
        rowsContainer.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-secondary);">Tidak ada produk aktif</td></tr>';
        return;
    }
    
    productsToRender.forEach(prod => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--card-border)';
        
        tr.innerHTML = `
            <td style="padding: 14px 12px; font-weight: 600; color: var(--text-primary); text-align: left;">${prod.name}</td>
            <td style="padding: 14px 12px; font-family: monospace; color: var(--text-muted); text-align: left;">${prod.sku}</td>
            <td style="padding: 14px 12px; font-weight: 700; color: var(--primary); text-align: left;">${formatRupiah(prod.priceAgent)}</td>
            <td style="padding: 14px 12px; text-align: right;">
                <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700;">AKTIF</span>
            </td>
        `;
        rowsContainer.appendChild(tr);
    });
}

// ---------------- VOUCHER FUNCTIONALITY ----------------

async function handleApplyVoucher() {
    if (!state.selectedProduct) {
        alert('Silakan pilih produk terlebih dahulu sebelum menerapkan kupon.');
        return;
    }
    const code = DOM.voucherInput.value.trim();
    if (!code) {
        alert('Masukkan kode voucher terlebih dahulu.');
        return;
    }

    DOM.btnApplyVoucher.disabled = true;
    DOM.btnApplyVoucher.textContent = '⏳ ...';
    
    try {
        const token = getToken();
        const res = await fetch('/api/vouchers/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                code: code,
                priceAgent: state.selectedProduct.priceAgent
            })
        });

        const result = await res.json();
        if (res.ok && result.success) {
            state.appliedVoucherCode = result.code;
            state.voucherDiscount = result.discount;

            // Show discount row in checkout box
            DOM.discountVal.textContent = `-${formatRupiah(result.discount)}`;
            DOM.discountRow.style.display = 'flex';

            // Show success message
            DOM.voucherStatusMsg.style.display = 'block';
            DOM.voucherStatusMsg.style.color = '#34d399'; // Success green
            DOM.voucherStatusMsg.textContent = `Kupon ${result.code} berhasil diterapkan! Diskon ${formatRupiah(result.discount)}`;
            
            // Recalculate total bayar
            updateCheckoutTotalDisplay();
        } else {
            // Failed
            resetVoucherState();
            DOM.voucherStatusMsg.style.display = 'block';
            DOM.voucherStatusMsg.style.color = '#f87171'; // Error red
            DOM.voucherStatusMsg.textContent = result.error || 'Voucher tidak dapat digunakan.';
        }
    } catch (err) {
        console.error('Apply voucher error:', err);
        alert('Gagal memvalidasi kupon.');
        resetVoucherState();
    } finally {
        DOM.btnApplyVoucher.disabled = false;
        DOM.btnApplyVoucher.textContent = 'Pakai';
    }
}

function resetVoucherState() {
    state.appliedVoucherCode = null;
    state.voucherDiscount = 0;
    if (DOM.voucherInput) DOM.voucherInput.value = '';
    if (DOM.discountRow) DOM.discountRow.style.display = 'none';
    if (DOM.discountVal) DOM.discountVal.textContent = '-Rp 0';
    if (DOM.voucherStatusMsg) DOM.voucherStatusMsg.style.display = 'none';
    if (DOM.voucherStatusMsg) DOM.voucherStatusMsg.textContent = '';
    updateCheckoutTotalDisplay();
}

function updateCheckoutTotalDisplay() {
    if (!state.selectedProduct) return;
    
    let total = state.selectedProduct.priceAgent - state.voucherDiscount;
    if (total < 0) total = 0;

    if (state.selectedPaymentMethod !== 'balance') {
        total += 2000; // Flat Rp 2.000 fee for Midtrans sandbox gateway simulation
    }
    
    DOM.checkoutTotal.textContent = formatRupiah(total);
}

// Check authorization on load
document.addEventListener('DOMContentLoaded', () => {
    applyThemeAndAccent();
    loadMidtransScript();
    setupListeners();
    checkAuth();
});
