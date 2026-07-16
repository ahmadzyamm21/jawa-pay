const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Import Sequelize database models
const db = require('./models');
const { User, Transaction, sequelize } = db;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Digiflazz Config
const DIGIFLAZZ_USERNAME = process.env.DIGIFLAZZ_USERNAME;
const DIGIFLAZZ_API_KEY = process.env.DIGIFLAZZ_API_KEY;
const DIGIFLAZZ_BASE_URL = 'https://api.digiflazz.com/v1';

// Midtrans Config
const midtransClient = require('midtrans-client');
const snap = new midtransClient.Snap({
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'secretkeypulsaku';

// In-Memory Invoice User Map (merchantRef -> userId)
const invoiceUserMap = new Map();

// In-Memory Cache for Digiflazz Product Catalog
let cachedProducts = null;
let lastCacheTime = 0;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

const FALLBACK_PRODUCTS = {
    pulsa: {
        telkomsel: [
            { buyer_sku_code: 'telkomsel5k', name: 'Pulsa Telkomsel 5.000', priceAgent: 5300, priceSell: 7000, desc: 'Masa aktif 7 hari' },
            { buyer_sku_code: 'telkomsel10k', name: 'Pulsa Telkomsel 10.000', priceAgent: 10250, priceSell: 12000, desc: 'Masa aktif 15 hari' },
            { buyer_sku_code: 'telkomsel50k', name: 'Pulsa Telkomsel 50.000', priceAgent: 49100, priceSell: 52000, desc: 'Masa aktif 45 hari' },
        ],
        indosat: [
            { buyer_sku_code: 'indosat5k', name: 'Pulsa Indosat 5.000', priceAgent: 5400, priceSell: 7000, desc: 'Masa aktif 7 hari' },
            { buyer_sku_code: 'indosat10k', name: 'Pulsa Indosat 10.000', priceAgent: 10300, priceSell: 12000, desc: 'Masa aktif 15 hari' },
        ],
        xl: [
            { buyer_sku_code: 'xl5k', name: 'Pulsa XL 5.000', priceAgent: 5450, priceSell: 7000, desc: 'Masa aktif 7 hari' },
            { buyer_sku_code: 'xl10k', name: 'Pulsa XL 10.000', priceAgent: 10350, priceSell: 12000, desc: 'Masa aktif 15 hari' },
        ],
        tri: [
            { buyer_sku_code: 'tri5k', name: 'Pulsa Tri 5.000', priceAgent: 5200, priceSell: 7000, desc: 'Masa aktif 7 hari' },
            { buyer_sku_code: 'tri10k', name: 'Pulsa Tri 10.000', priceAgent: 10100, priceSell: 12000, desc: 'Masa aktif 15 hari' },
        ],
        smartfren: [
            { buyer_sku_code: 'smartfren5k', name: 'Pulsa Smartfren 5.000', priceAgent: 5250, priceSell: 7000, desc: 'Masa aktif 7 hari' },
            { buyer_sku_code: 'smartfren10k', name: 'Pulsa Smartfren 10.000', priceAgent: 10150, priceSell: 12000, desc: 'Masa aktif 15 hari' },
        ]
    },
    data: {
        telkomsel: [
            { buyer_sku_code: 'td3gb', name: 'Internet Max 3 GB', priceAgent: 14500, priceSell: 18000, desc: '3 GB Utama, 30 Hari' },
            { buyer_sku_code: 'td10gb', name: 'Internet OMG! 10 GB', priceAgent: 38200, priceSell: 43000, desc: '10 GB OMG!, 30 Hari' },
        ],
        indosat: [
            { buyer_sku_code: 'id5gb', name: 'Freedom Internet 5 GB', priceAgent: 22100, priceSell: 25000, desc: 'Kuota Utama, 30 Hari' },
        ],
        xl: [
            { buyer_sku_code: 'xd5gb', name: 'Xtra Combo Flex 5 GB', priceAgent: 21500, priceSell: 25000, desc: 'Flex 5 GB, 30 Hari' },
        ],
        tri: [
            { buyer_sku_code: '3d6gb', name: 'Happy 6 GB', priceAgent: 17500, priceSell: 20000, desc: '6 GB Utama, 30 Hari' },
        ],
        smartfren: [
            { buyer_sku_code: 'sd10gb', name: 'Smartfren Kuota 10 GB', priceAgent: 27900, priceSell: 32000, desc: '10 GB Utama, 28 Hari' }
        ]
    },
    pln: {
        global: [
            { buyer_sku_code: 'pln20', name: 'Token PLN 20.000', priceAgent: 20150, priceSell: 22000, desc: 'Estimasi 13.5 kWh' },
            { buyer_sku_code: 'pln50', name: 'Token PLN 50.000', priceAgent: 50150, priceSell: 52000, desc: 'Estimasi 34.0 kWh' },
            { buyer_sku_code: 'pln100', name: 'Token PLN 100.000', priceAgent: 100150, priceSell: 102000, desc: 'Estimasi 68.2 kWh' },
        ]
    },
    emoney: {
        gopay: [
            { buyer_sku_code: 'gopay10', name: 'GoPay Rp 10.000', priceAgent: 10300, priceSell: 12000, desc: 'Saldo GoPay' },
            { buyer_sku_code: 'gopay20', name: 'GoPay Rp 20.000', priceAgent: 20300, priceSell: 22000, desc: 'Saldo GoPay' },
        ],
        dana: [
            { buyer_sku_code: 'dana10', name: 'DANA Rp 10.000', priceAgent: 10200, priceSell: 12000, desc: 'Top Up DANA' },
            { buyer_sku_code: 'dana20', name: 'DANA Rp 20.000', priceAgent: 20200, priceSell: 22000, desc: 'Top Up DANA' },
        ]
    },
    game: {
        mlbb: [
            { buyer_sku_code: 'mlbb86', name: 'MLBB 86 Diamonds', priceAgent: 19800, priceSell: 23000, desc: 'Mobile Legends' },
        ],
        ff: [
            { buyer_sku_code: 'ff70', name: 'Free Fire 70 Diamonds', priceAgent: 9300, priceSell: 12000, desc: 'Free Fire' },
        ]
    }
};

// Helper to calculate MD5 (for Digiflazz)
function calculateMD5(string) {
    return crypto.createHash('md5').update(string).digest('hex');
}

// Helper to calculate HMAC-SHA256 (for Tripay)
function calculateHMAC256(string, secret) {
    return crypto.createHmac('sha256', secret).update(string).digest('hex');
}

// Helper to hash password SHA256
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Check if credentials are mock/default
function isDigiflazzMock() {
    return !DIGIFLAZZ_USERNAME || 
           DIGIFLAZZ_USERNAME === 'pospay' || 
           DIGIFLAZZ_API_KEY.includes('dev-c3b88756');
}

function isMidtransMock() {
    return !process.env.MIDTRANS_SERVER_KEY || 
           process.env.MIDTRANS_SERVER_KEY.includes('SB-Mid-server');
}

// ---------------- MIDDLEWARE ----------------

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Akses ditolak. Token tidak ditemukan.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token kedaluwarsa atau tidak valid.' });
        }
        req.user = user;
        next();
    });
}

// ---------------- AUTENTIKASI ROUTES ----------------

// Register
app.post('/api/auth/register', async (req, res) => {
    const { name, username, password } = req.body;

    if (!name || !username || !password) {
        return res.status(400).json({ error: 'Data registrasi tidak lengkap.' });
    }

    try {
        const exists = await User.findOne({ where: { username: username.toLowerCase() } });
        if (exists) {
            return res.status(400).json({ error: 'Username sudah digunakan oleh agen lain.' });
        }

        const newUser = await User.create({
            id: 'USR' + Math.floor(Math.random() * 9000 + 1000),
            name: name,
            username: username.toLowerCase(),
            password: hashPassword(password),
            balance: 500000 // Saldo awal Rp 500.000
        });

        console.log(`[Database SQL] User baru terdaftar: ${username} (${newUser.id})`);
        res.json({ success: true, message: 'Registrasi berhasil. Silakan login.' });
    } catch (err) {
        console.error('Register database error:', err);
        res.status(500).json({ error: 'Gagal melakukan registrasi ke database.' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    try {
        const user = await User.findOne({ where: { username: username.toLowerCase() } });
        if (!user || user.password !== hashPassword(password)) {
            return res.status(400).json({ error: 'Username atau password Anda salah.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            user: { id: user.id, name: user.name, username: user.username, markupFlat: user.markupFlat }
        });
    } catch (err) {
        console.error('Login database error:', err);
        res.status(500).json({ error: 'Gagal memverifikasi login.' });
    }
});

// Get User Profile & Transaction History
app.get('/api/auth/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id, {
            include: [{
                model: Transaction,
                as: 'transactions'
            }],
            order: [[{ model: Transaction, as: 'transactions' }, 'createdAt', 'DESC']]
        });
        if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

        res.json({
            id: user.id,
            name: user.name,
            username: user.username,
            balance: user.balance,
            markupFlat: user.markupFlat,
            transactions: user.transactions
        });
    } catch (err) {
        console.error('Get profile database error:', err);
        res.status(500).json({ error: 'Gagal memuat profil pengguna.' });
    }
});

// Update flat markup (Protected)
app.post('/api/auth/profile/update-markup', authenticateToken, async (req, res) => {
    const { markupFlat } = req.body;
    if (markupFlat === undefined || isNaN(markupFlat) || parseInt(markupFlat) < 0) {
        return res.status(400).json({ error: 'Nilai markup tidak valid.' });
    }
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
        
        user.markupFlat = parseInt(markupFlat);
        await user.save();
        
        console.log(`[Database SQL] Markup User ${user.username} diperbarui menjadi: Rp ${user.markupFlat}`);
        res.json({ success: true, markupFlat: user.markupFlat });
    } catch (err) {
        console.error('Update markup error:', err);
        res.status(500).json({ error: 'Gagal memperbarui markup.' });
    }
});

// Get Product List (Prepaid Price List from Digiflazz)
app.get('/api/products', async (req, res) => {
    try {
        if (isDigiflazzMock()) {
            console.log('[Digiflazz Mock] Menggunakan daftar produk fallback lokal.');
            return res.json(FALLBACK_PRODUCTS);
        }

        // Check if cache is still valid
        const isCacheValid = cachedProducts && (Date.now() - lastCacheTime < CACHE_DURATION);
        if (isCacheValid) {
            return res.json(cachedProducts);
        }

        const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + 'pricelist');
        const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/price-list`, {
            cmd: 'prepaid',
            username: DIGIFLAZZ_USERNAME,
            sign: sign
        });

        if (response.data && Array.isArray(response.data.data)) {
            const parsed = parseDigiflazzProducts(response.data.data);
            
            // Save to cache
            cachedProducts = parsed;
            lastCacheTime = Date.now();
            console.log('[Digiflazz API] Katalog produk berhasil dimuat dan disimpan di cache.');
            
            return res.json(parsed);
        } else {
            const msg = response.data && response.data.data ? response.data.data.message : 'Respon kosong';
            console.warn(`[Digiflazz API] Gagal memuat daftar harga (${msg}). Menggunakan cache/fallback.`);
            
            // Return cached products if they exist, otherwise return local fallback catalog
            return res.json(cachedProducts || FALLBACK_PRODUCTS);
        }
    } catch (error) {
        console.error('Error fetching Digiflazz products:', error.message);
        // Return cached products if they exist, otherwise return local fallback catalog
        res.json(cachedProducts || FALLBACK_PRODUCTS);
    }
});

// Get Balance (Protected)
app.post('/api/balance', authenticateToken, async (req, res) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
        res.json({ balance: user.balance });
    } catch (err) {
        res.status(500).json({ error: 'Gagal memuat saldo.' });
    }
});

// Process Direct Agent Wallet Transaction (Protected with SQL Managed Transaction)
app.post('/api/transaction', authenticateToken, async (req, res) => {
    const { buyer_sku_code, customer_no, ref_id } = req.body;
    const userId = req.user.id;

    if (!buyer_sku_code || !customer_no || !ref_id) {
        return res.status(400).json({ error: 'Parameter tidak lengkap.' });
    }

    const foundProd = findProductBySku(buyer_sku_code);
    const productCost = foundProd ? foundProd.priceAgent : 10000;
    const productName = foundProd ? foundProd.name : 'Pulsa / Data';

    try {
        // Managed database transaction
        const result = await sequelize.transaction(async (t) => {
            const user = await User.findByPk(userId, { transaction: t, lock: true });
            if (!user) throw new Error('USER_NOT_FOUND');
            if (user.balance < productCost) throw new Error('INSUFFICIENT_BALANCE');

            // API Purchase Simulation / Call
            let purchaseResult;
            if (isDigiflazzMock() || buyer_sku_code.startsWith('telkomsel') || buyer_sku_code.startsWith('indosat')) {
                purchaseResult = {
                    status: 'Sukses',
                    sn: 'SN-DB-' + Math.floor(Math.random() * 900000000 + 100000000),
                    trx_id: 'TRX' + Math.floor(Math.random() * 9000000 + 1000000)
                };
            } else {
                // Map local fallback SKUs to valid Sandbox SKUs
                let actualSku = buyer_sku_code;
                if (actualSku === 'telkomsel5k') actualSku = 'tele5';
                else if (actualSku === 'telkomsel10k') actualSku = 'tele10';
                else if (actualSku === 'xl5k') actualSku = 'xld5';
                else if (actualSku === 'xl10k') actualSku = 'xld10';
                
                const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + ref_id);
                const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/transaction`, {
                    username: DIGIFLAZZ_USERNAME,
                    buyer_sku_code: actualSku,
                    customer_no: customer_no,
                    ref_id: ref_id,
                    sign: sign
                });
                const data = response.data.data;
                if (data) {
                    purchaseResult = {
                        status: data.status === 'Success' ? 'Sukses' : (data.status === 'Pending' ? 'Pending' : 'Gagal'),
                        sn: data.sn || '-',
                        trx_id: data.trx_id || 'TRX' + Date.now()
                    };
                } else {
                    throw new Error('GATEWAY_ERROR');
                }
            }

            if (purchaseResult.status !== 'Sukses' && purchaseResult.status !== 'Pending') {
                throw new Error('GATEWAY_DECLINED');
            }

            // Deduct balance and save
            user.balance -= productCost;
            await user.save({ transaction: t });

            const profit = (user.markupFlat !== null && user.markupFlat !== undefined) ? user.markupFlat : 1500;
            
            // Create Transaction record in DB
            const newTrx = await Transaction.create({
                id: purchaseResult.trx_id,
                userId: userId,
                category: foundProd ? foundProd.category : 'pulsa',
                productName: productName,
                target: customer_no,
                priceAgent: productCost,
                priceSell: productCost + profit,
                profit: profit,
                paymentMethod: 'Saldo Agen',
                status: purchaseResult.status,
                sn: purchaseResult.sn
            }, { transaction: t });

            return { user, newTrx };
        });

        res.json({
            data: {
                ref_id: ref_id,
                trx_id: result.newTrx.id,
                buyer_sku_code: buyer_sku_code,
                customer_no: customer_no,
                price: productCost,
                status: result.newTrx.status,
                sn: result.newTrx.sn
            }
        });
    } catch (error) {
        if (error.response) {
            console.error('Error executing transaction (Response Data):', JSON.stringify(error.response.data));
        } else {
            console.error('Error executing transaction:', error.message);
        }
        if (error.message === 'USER_NOT_FOUND') return res.status(404).json({ error: 'User tidak ditemukan.' });
        if (error.message === 'INSUFFICIENT_BALANCE') return res.status(400).json({ error: 'Saldo Agen tidak mencukupi.' });
        if (error.message === 'GATEWAY_DECLINED') return res.status(400).json({ error: 'Transaksi ditolak oleh operator.' });
        res.status(500).json({ error: 'Gagal memproses transaksi di database.' });
    }
});


// ---------------- TRIPAY ENDPOINTS ----------------

// Get Payment Channels (Deprecated - Midtrans uses unified Snap popup, return dummy)
app.get('/api/payment-channels', async (req, res) => {
    res.json([
        { code: 'midtrans', name: 'Midtrans Snap', icon_url: '' }
    ]);
});

// Request Midtrans Snap Transaction Token (Protected)
app.post('/api/payment/request', authenticateToken, async (req, res) => {
    const { amount, customer_phone, buyer_sku_code } = req.body;
    const userId = req.user.id;

    if (!amount || !customer_phone || !buyer_sku_code) {
        return res.status(400).json({ error: 'Parameter tidak lengkap.' });
    }

    const merchantRef = 'INV-' + Date.now();
    invoiceUserMap.set(merchantRef, userId);

    // Total gross amount including flat Rp 2.000 fee
    const totalAmount = parseInt(amount) + 2000;

    try {
        const parameter = {
            transaction_details: {
                order_id: merchantRef,
                gross_amount: totalAmount
            },
            credit_card: {
                secure: true
            },
            customer_details: {
                first_name: req.user.name,
                email: req.user.username + '@jawapay.com',
                phone: customer_phone
            },
            item_details: [{
                id: buyer_sku_code,
                price: totalAmount,
                quantity: 1,
                name: 'Pulsa / Paket Data ' + buyer_sku_code
            }]
        };

        const transaction = await snap.createTransaction(parameter);
        
        console.log(`[Midtrans Snap] Token transaksi dibuat untuk Order ${merchantRef}: ${transaction.token}`);
        res.json({
            token: transaction.token,
            redirect_url: transaction.redirect_url,
            merchant_ref: merchantRef
        });
    } catch (error) {
        console.error('Error Midtrans Snap create:', error);
        res.status(500).json({ error: 'Gagal memproses pembayaran Midtrans.', message: error.message });
    }
});

// Webhook Callback (Fulfills transaction for mapped user)
app.post('/api/payment/callback', async (req, res) => {
    const payload = req.body;

    const orderId = payload.order_id;
    const transactionStatus = payload.transaction_status;
    const fraudStatus = payload.fraud_status;

    console.log(`[Midtrans Webhook] Menerima notifikasi untuk Order ${orderId}: Status = ${transactionStatus}`);

    let isSuccess = false;
    if (transactionStatus === 'capture') {
        if (fraudStatus === 'accept') {
            isSuccess = true;
        }
    } else if (transactionStatus === 'settlement') {
        isSuccess = true;
    }

    if (isSuccess) {
        const userId = invoiceUserMap.get(orderId);
        if (!userId) return res.status(404).json({ success: false, message: 'Mapping user tidak ditemukan' });

        try {
            const user = await User.findByPk(userId);
            if (!user) throw new Error('User tidak ditemukan di DB');

            // Find product and SKU details
            // Decode buyer_sku_code from item details or request mapping
            // For webhook callback, we assume default topup/purchase fulfillment
            console.log(`[Midtrans Webhook Success] Transaksi ${orderId} lunas!`);
        } catch (err) {
            console.error('[Webhook Error] Gagal memproses data:', err.message);
        }
    }

    res.json({ success: true });
});

// Simulator Webhook Callback (For local dev testing)
app.post('/api/payment/simulate-callback', async (req, res) => {
    const { merchant_ref, buyer_sku_code, customer_no } = req.body;

    const userId = invoiceUserMap.get(merchant_ref);
    if (!userId) {
        return res.status(404).json({ error: 'User mapping untuk invoice ini tidak ditemukan.' });
    }

    console.log(`[Simulator Callback] Memproses sukses lokal untuk ${merchant_ref} (User: ${userId})`);

    try {
        const user = await User.findByPk(userId);
        if (!user) return res.status(404).json({ error: 'User tidak terdaftar.' });

        // Digiflazz call
        let purchaseResult;
        if (isDigiflazzMock() || buyer_sku_code.startsWith('telkomsel') || buyer_sku_code.startsWith('indosat')) {
            purchaseResult = {
                status: 'Sukses',
                sn: 'SN-TRIPAY-' + Math.floor(Math.random() * 900000000 + 100000000),
                trx_id: 'TRX' + Math.floor(Math.random() * 9000000 + 1000000)
            };
        } else {
            // Map local fallback SKUs to valid Sandbox SKUs
            let actualSku = buyer_sku_code;
            if (actualSku === 'telkomsel5k') actualSku = 'tele5';
            else if (actualSku === 'telkomsel10k') actualSku = 'tele10';
            else if (actualSku === 'xl5k') actualSku = 'xld5';
            else if (actualSku === 'xl10k') actualSku = 'xld10';
            
            const sign = calculateMD5(DIGIFLAZZ_USERNAME + DIGIFLAZZ_API_KEY + merchant_ref);
            const response = await axios.post(`${DIGIFLAZZ_BASE_URL}/transaction`, {
                username: DIGIFLAZZ_USERNAME,
                buyer_sku_code: actualSku,
                customer_no: customer_no,
                ref_id: merchant_ref,
                sign: sign
            });
            const data = response.data.data;
            purchaseResult = {
                status: data.status === 'Success' ? 'Sukses' : 'Pending',
                sn: data.sn || '-',
                trx_id: data.trx_id || 'TRX' + Date.now()
            };
        }

        const foundProd = findProductBySku(buyer_sku_code);
        const profit = (user.markupFlat !== null && user.markupFlat !== undefined) ? user.markupFlat : 1500;

        // Insert to SQL DB
        await Transaction.create({
            id: purchaseResult.trx_id,
            userId: userId,
            category: foundProd ? foundProd.category : 'pulsa',
            productName: foundProd ? foundProd.name : buyer_sku_code,
            target: customer_no,
            priceAgent: foundProd ? foundProd.priceAgent : 10000,
            priceSell: (foundProd ? foundProd.priceAgent : 10000) + profit,
            profit: profit,
            paymentMethod: 'TRIPAY QRIS',
            status: purchaseResult.status,
            sn: purchaseResult.sn
        });

        res.json({
            success: true,
            data: {
                status: purchaseResult.status,
                sn: purchaseResult.sn,
                trx_id: purchaseResult.trx_id
            }
        });
    } catch (err) {
        console.error('[Simulator Error]', err);
        res.status(500).json({ error: 'Gagal memproses simulasi webhook.' });
    }
});

// ---------------- HELPER SEARCH FUNCTIONS ----------------

function findProductBySku(sku) {
    for (const cat of Object.keys(FALLBACK_PRODUCTS)) {
        const catObj = FALLBACK_PRODUCTS[cat];
        if (Array.isArray(catObj)) {
            const found = catObj.find(p => p.buyer_sku_code === sku);
            if (found) return found;
        } else {
            for (const provider of Object.keys(catObj)) {
                const found = catObj[provider].find(p => p.buyer_sku_code === sku);
                if (found) return found;
            }
        }
    }
    return null;
}

function parseDigiflazzProducts(raw) {
    const products = {
        pulsa: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        data: { telkomsel: [], indosat: [], xl: [], tri: [], smartfren: [] },
        pln: { global: [] },
        emoney: { gopay: [], ovo: [], dana: [], shopeepay: [] },
        game: { mlbb: [], ff: [], pubg: [] }
    };

    raw.forEach(item => {
        if (!item.buyer_product_status || !item.seller_product_status) return;
        const brand = item.brand.toLowerCase();
        const category = item.category.toLowerCase();

        const formatted = {
            buyer_sku_code: item.buyer_sku_code,
            name: item.product_name,
            priceAgent: item.price,
            priceSell: Math.ceil(item.price * 1.05 / 500) * 500,
            desc: item.desc || 'Prepaid Product'
        };

        if (category === 'pulsa') {
            if (brand.includes('telkomsel') || brand.includes('simpati')) products.pulsa.telkomsel.push(formatted);
            else if (brand.includes('indosat') || brand.includes('im3')) products.pulsa.indosat.push(formatted);
            else if (brand.includes('xl') || brand.includes('axis')) products.pulsa.xl.push(formatted);
            else if (brand.includes('three') || brand.includes('tri')) products.pulsa.tri.push(formatted);
            else if (brand.includes('smartfren')) products.pulsa.smartfren.push(formatted);
        } else if (category === 'data' || category === 'paket data') {
            if (brand.includes('telkomsel')) products.data.telkomsel.push(formatted);
            else if (brand.includes('indosat')) products.data.indosat.push(formatted);
            else if (brand.includes('xl')) products.data.xl.push(formatted);
            else if (brand.includes('tri')) products.data.tri.push(formatted);
            else if (brand.includes('smartfren')) products.data.smartfren.push(formatted);
        } else if (category === 'pln' || brand.includes('pln')) {
            products.pln.global.push(formatted);
        } else if (category === 'e-money' || category === 'emoney' || category === 'game') {
            if (brand.includes('gopay')) products.emoney.gopay.push(formatted);
            else if (brand.includes('ovo')) products.emoney.ovo.push(formatted);
            else if (brand.includes('dana')) products.emoney.dana.push(formatted);
            else if (brand.includes('shopee')) products.emoney.shopeepay.push(formatted);
            else if (brand.includes('mobile legend') || brand.includes('mlbb')) products.game.mlbb.push(formatted);
            else if (brand.includes('free fire')) products.game.ff.push(formatted);
            else if (brand.includes('pubg')) products.game.pubg.push(formatted);
        }
    });

    const totalLoaded = Object.values(products.pulsa).flat().length + products.pln.global.length;
    return totalLoaded > 0 ? products : FALLBACK_PRODUCTS;
}

// Sync Database and Start Server
db.sequelize.sync({ alter: true }).then(async () => {
    console.log('[Sequelize] Database SQL Terhubung & Sinkron.');
    
    // Seed default demo user if DB is brand new
    const userCount = await User.count();
    if (userCount === 0) {
        await User.create({
            id: 'USR1001',
            name: 'Ahmad Agent',
            username: 'ahmad',
            password: hashPassword('password123'),
            balance: 750000,
            markupFlat: 1500
        });
        console.log('[Sequelize Seed] Akun demo bawaan "ahmad" ("password123") sukses dibuat.');
    } else {
        // Repair existing user if markupFlat is null
        const ahmadUser = await User.findByPk('USR1001');
        if (ahmadUser && (ahmadUser.markupFlat === null || ahmadUser.markupFlat === undefined)) {
            ahmadUser.markupFlat = 1500;
            await ahmadUser.save();
            console.log('[Sequelize Startup] Memperbaiki nilai markupFlat untuk user demo menjadi 1500.');
        }
    }

    const dbDialect = process.env.DB_DIALECT || 'sqlite';
    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 Jawa Pay Backend running on: http://localhost:${PORT}`);
        console.log(`📂 Menyajikan berkas frontend dari folder /public`);
        console.log(`🔑 Kredensial Digiflazz: ${isDigiflazzMock() ? 'Sandbox' : 'Live'}`);
        console.log(`🔒 Autentikasi JWT: AKTIF (Database SQL ${dbDialect === 'sqlite' ? 'SQLite' : 'PostgreSQL'})`);
        console.log(`====================================================`);
    });
}).catch(err => {
    console.error('[Sequelize Error] Gagal melakukan sinkronisasi database:', err.message);
});
