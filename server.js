const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const fetch = require('node-fetch'); // For Node.js versions < 18
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3001;
const SECRET_KEY = process.env.SECRET_KEY || 'your_secret_key_change_in_production'; // Use environment variable

// File paths for Excel files
const USERS_FILE = path.join(__dirname, 'users.xlsx');
const PAYMENTS_FILE = path.join(__dirname, 'payments.xlsx');
const LUNAS_FILE = path.join(__dirname, 'lunas.xlsx');
const VISITORS_FILE = path.join(__dirname, 'visitors.xlsx');

app.use(session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*', // Allow all origins for local network access
    credentials: true
}));
app.use(express.json({ limit: '10mb' })); // Increase limit for large payloads
app.use(express.static('.')); // Serve static files

// Geolocation middleware to track visitor countries only on visitor-info.html
app.use(async (req, res, next) => {
    if (req.path !== '/visitor-info.html') {
        return next();
    }

    try {
        // Get client IP address
        let ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || req.connection.socket.remoteAddress;

        // Handle IPv4-mapped IPv6 addresses
        if (ip && ip.startsWith('::ffff:')) {
            ip = ip.substring(7);
        }

        // Skip local IPs
        if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
            return next();
        }

        // Check if we already have this IP in the last hour to avoid duplicates
        const visitors = loadFromExcel(VISITORS_FILE, 'Visitors');
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentVisit = visitors.find(v => v.ip === ip && new Date(v.visited_at) > oneHourAgo);

        if (recentVisit) {
            return next();
        }

        // Fetch country from IP using free API
        const response = await fetch(`http://ipapi.co/${ip}/json/`);
        if (response.ok) {
            const geoData = await response.json();
            const country = geoData.country_name || 'Unknown';

            // Save visitor data
            const newId = visitors.length > 0 ? Math.max(...visitors.map(v => v.id || 0)) + 1 : 1;
            const visitorRecord = {
                id: newId,
                ip: ip,
                country: country,
                visited_at: new Date().toISOString()
            };
            visitors.push(visitorRecord);
            saveToExcel(VISITORS_FILE, 'Visitors', visitors);
        }
    } catch (error) {
        console.error('Geolocation tracking error:', error);
        // Continue without failing the request
    }
    next();
});

// Passport configuration
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || 'your_facebook_app_id',
    clientSecret: process.env.FACEBOOK_APP_SECRET || 'your_facebook_app_secret',
    callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/facebook/callback`,
    profileFields: ['id', 'displayName', 'emails']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        let user = users.find(u => u.provider === 'facebook' && u.providerId === profile.id);

        if (!user) {
            // Create new user
            const newId = users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1;
            user = {
                id: newId,
                fullName: profile.displayName,
                email: profile.emails ? profile.emails[0].value : '',
                phone: '',
                password: '', // No password for OAuth users
                provider: 'facebook',
                providerId: profile.id,
                created_at: new Date().toISOString()
            };
            users.push(user);
            try {
                saveToExcel(USERS_FILE, 'Users', users);
                console.log('Facebook user saved successfully:', user.id);
            } catch (saveError) {
                console.error('Error saving Facebook user:', saveError);
                return done(saveError, null);
            }
        }

        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'your-google-client-id.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret',
    callbackURL: `${process.env.BASE_URL || 'http://localhost:3000'}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        let user = users.find(u => u.provider === 'google' && u.providerId === profile.id);

        if (!user) {
            // Create new user
            const newId = users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1;
            user = {
                id: newId,
                fullName: profile.displayName,
                email: profile.emails ? profile.emails[0].value : '',
                phone: '',
                password: '', // No password for OAuth users
                provider: 'google',
                providerId: profile.id,
                created_at: new Date().toISOString()
            };
            users.push(user);
            try {
                saveToExcel(USERS_FILE, 'Users', users);
                console.log('Google user saved successfully:', user.id);
            } catch (saveError) {
                console.error('Error saving Google user:', saveError);
                return done(saveError, null);
            }
        }

        return done(null, user);
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        const user = users.find(u => u.id === id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

app.use(passport.initialize());
app.use(passport.session());

// Helper function to load data from Excel with error handling
function loadFromExcel(filePath, sheetName) {
    try {
        if (!fs.existsSync(filePath)) {
            return [];
        }
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return [];
        const data = XLSX.utils.sheet_to_json(sheet);
        // Filter out empty objects that might be created during initialization
        return data.filter(row => Object.keys(row).length > 0);
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error);
        return [];
    }
}

// Helper function to save data to Excel with error handling and retry
async function saveToExcel(filePath, sheetName, data, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            if (data.length === 0) {
                // For empty data, create a new workbook with a dummy sheet to avoid empty workbook error
                const workbook = XLSX.utils.book_new();
                const sheet = XLSX.utils.aoa_to_sheet([['']]);
                XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
                XLSX.writeFile(workbook, filePath, { bookType: 'xlsx' });
                return;
            }

            // For non-empty data, proceed as before
            let workbook;
            if (fs.existsSync(filePath)) {
                workbook = XLSX.readFile(filePath);
            } else {
                workbook = XLSX.utils.book_new();
            }

            const sheet = XLSX.utils.json_to_sheet(data);
            workbook.Sheets[sheetName] = sheet;

            // Use temp file to avoid permission issues when file is open in Excel
            const tempFilePath = filePath + '.tmp';
            XLSX.writeFile(workbook, tempFilePath, { bookType: 'xlsx' });
            fs.renameSync(tempFilePath, filePath);
            return; // Success, exit the function
        } catch (error) {
            console.error(`Error saving ${filePath} (attempt ${attempt}):`, error);
            if (attempt === retries) {
                // Instead of throwing, try to create a minimal valid workbook
                try {
                    const fallbackWorkbook = XLSX.utils.book_new();
                    const fallbackSheet = XLSX.utils.aoa_to_sheet([['']]);
                    XLSX.utils.book_append_sheet(fallbackWorkbook, fallbackSheet, sheetName);
                    XLSX.writeFile(fallbackWorkbook, filePath, { bookType: 'xlsx' });
                } catch (fallbackError) {
                    console.error(`Fallback save failed for ${filePath}:`, fallbackError);
                    // Do not throw, just log
                }
            } else {
                // Wait a bit before retrying
                const delay = attempt * 100; // Increasing delay
                console.log(`Retrying save in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}

// Initialize files if they don't exist
function initializeFiles() {
    try {
        if (!fs.existsSync(USERS_FILE)) {
            saveToExcel(USERS_FILE, 'Users', []);
        }
        if (!fs.existsSync(PAYMENTS_FILE)) {
            saveToExcel(PAYMENTS_FILE, 'Payments', []);
        }
        if (!fs.existsSync(LUNAS_FILE)) {
            // Create empty workbook for lunas.xlsx with a sheet
            const workbook = XLSX.utils.book_new();
            const sheet = XLSX.utils.aoa_to_sheet([[]]);
            XLSX.utils.book_append_sheet(workbook, sheet, 'Lunas');
            XLSX.writeFile(workbook, LUNAS_FILE);
        }
        if (!fs.existsSync(VISITORS_FILE)) {
            saveToExcel(VISITORS_FILE, 'Visitors', []);
        }
    } catch (error) {
        console.error('Error initializing files:', error);
    }
}

initializeFiles();

// Middleware to verify JWT
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
}

// Input validation middleware
function validateRegistration(req, res, next) {
    const { fullName, email, phone, password } = req.body;
    if (!fullName || !email || !phone || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    if (fullName.length < 2) return res.status(400).json({ error: 'Full name must be at least 2 characters' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    next();
}

// Register endpoint
app.post('/api/register', validateRegistration, async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newId = users.length > 0 ? Math.max(...users.map(u => u.id || 0)) + 1 : 1;
        const newUser = {
            id: newId,
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            phone: phone.trim(),
            password: hashedPassword,
            created_at: new Date().toISOString()
        };
        users.push(newUser);
        try {
            saveToExcel(USERS_FILE, 'Users', users);
            console.log('Manual registration user saved successfully:', newUser.id);
        } catch (saveError) {
            console.error('Error saving manual registration user:', saveError);
            return res.status(500).json({ error: 'Server error during registration' });
        }

        // Generate JWT token for auto-login
        const token = jwt.sign({ id: newUser.id, email: newUser.email }, SECRET_KEY, { expiresIn: '24h' });

        res.status(201).json({
            message: 'User registered successfully',
            userId: newId,
            token,
            user: { id: newUser.id, fullName: newUser.fullName, email: newUser.email }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        const user = users.find(u => u.email.toLowerCase() === username.toLowerCase().trim());
        if (!user) return res.status(400).json({ error: 'User not found' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ id: user.id, email: user.email }, SECRET_KEY, { expiresIn: '24h' });
        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, fullName: user.fullName, email: user.email }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Logout endpoint (client-side token removal, but for completeness)
app.post('/api/logout', authenticateToken, (req, res) => {
    res.json({ message: 'Logged out successfully' });
});

// Get user profile
app.get('/api/profile', authenticateToken, (req, res) => {
    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        const user = users.find(u => u.id === req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const { password, ...userProfile } = user;
        res.json(userProfile);
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Payment endpoint
app.post('/api/payment', authenticateToken, (req, res) => {
    console.log('Payment processing started at:', new Date().toISOString());
    const { amount, items, paymentMethod, bankAccount, bankName, shippingAddress } = req.body;

    if (!amount || !items || !paymentMethod) {
        return res.status(400).json({ error: 'Amount, items, and payment method are required' });
    }

    const userId = req.user.id;

    try {
        const payments = loadFromExcel(PAYMENTS_FILE, 'Payments');
        const newId = payments.length > 0 ? Math.max(...payments.map(p => p.id || 0)) + 1 : 1;

        // Calculate delivery time based on shipping address
        let deliveryDays = 1; // Default
        if (shippingAddress && shippingAddress.shippingDays) {
            deliveryDays = shippingAddress.shippingDays;
        } else {
            // Fallback to random if not provided
            deliveryDays = Math.floor(Math.random() * 5) + 1;
        }
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + deliveryDays);

        const newPayment = {
            id: newId,
            user_id: userId,
            amount: parseFloat(amount),
            items: JSON.stringify(items),
            payment_method: paymentMethod,
            bank_account: bankAccount || '',
            bank_name: bankName || '',
            status: 'completed', // Assuming payment is successful for demo
            delivery_status: 'processing',
            delivery_days: deliveryDays,
            estimated_delivery: deliveryDate.toISOString(),
            created_at: new Date().toISOString(),
            // Add shipping address fields
            shipping_full_name: shippingAddress ? shippingAddress.fullName : '',
            shipping_phone: shippingAddress ? shippingAddress.phone : '',
            shipping_address: shippingAddress ? shippingAddress.address : '',
            shipping_rt: shippingAddress ? shippingAddress.rt : '',
            shipping_rw: shippingAddress ? shippingAddress.rw : '',
            shipping_postal_code: shippingAddress ? shippingAddress.postalCode : ''
        };
        payments.push(newPayment);
        saveToExcel(PAYMENTS_FILE, 'Payments', payments);

        // Record to lunas.xlsx if payment is completed
        if (newPayment.status === 'completed') {
            try {
                console.log('Recording payment to lunas.xlsx for user:', userId, 'payment ID:', newId);
                const users = loadFromExcel(USERS_FILE, 'Users');
                const user = users.find(u => u.id === userId);
                const lunasData = loadFromExcel(LUNAS_FILE, 'Lunas');
                console.log('Current lunas data length:', lunasData.length);
                const lunasRecord = {
                    fullName: user ? user.fullName : '',
                    email: user ? user.email : '',
                    phone: user ? user.phone : '',
                    amount: newPayment.amount,
                    items: newPayment.items,
                    payment_method: newPayment.payment_method,
                    status: newPayment.status,
                    created_at: newPayment.created_at,
                    shipping_full_name: newPayment.shipping_full_name,
                    shipping_phone: newPayment.shipping_phone,
                    shipping_address: newPayment.shipping_address,
                    shipping_rt: newPayment.shipping_rt,
                    shipping_rw: newPayment.shipping_rw,
                    shipping_postal_code: newPayment.shipping_postal_code
                };
                lunasData.push(lunasRecord);
                console.log('Added record to lunas data, new length:', lunasData.length);
                const saveResult = saveToExcel(LUNAS_FILE, 'Lunas', lunasData);
                console.log('Successfully saved to lunas.xlsx');
            } catch (lunasError) {
                console.error('Error recording to lunas.xlsx:', lunasError);
                // Continue with response, don't fail the payment
            }
        }

        // Success message with delivery info
        const message = `Pembayaran berhasil! Pesanan Anda akan dikirim dalam ${deliveryDays} hari. Estimasi tiba: ${deliveryDate.toLocaleDateString('id-ID')}. Terima kasih atas pembelian Anda! 🎉`;

        console.log('Payment processing finished at:', new Date().toISOString());
        res.status(201).json({
            message: message,
            paymentId: newId,
            deliveryDays: deliveryDays,
            estimatedDelivery: deliveryDate.toISOString(),
            orderNumber: `JGT-${newId.toString().padStart(6, '0')}`
        });
    } catch (error) {
        console.error('Payment error:', error);
        res.status(500).json({ error: 'Server error during payment' });
    }
});

// Get user payments
app.get('/api/payments', authenticateToken, (req, res) => {
    try {
        const payments = loadFromExcel(PAYMENTS_FILE, 'Payments');
        const userPayments = payments.filter(p => p.user_id === req.user.id);
        res.json(userPayments);
    } catch (error) {
        console.error('Get payments error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get receipt for a specific payment
app.get('/api/receipt/:id', authenticateToken, (req, res) => {
    try {
        const paymentId = parseInt(req.params.id);
        const payments = loadFromExcel(PAYMENTS_FILE, 'Payments');
        const users = loadFromExcel(USERS_FILE, 'Users');

        const payment = payments.find(p => p.id === paymentId && p.user_id === req.user.id);
        if (!payment) {
            return res.status(404).json({ error: 'Payment not found' });
        }

        const user = users.find(u => u.id === payment.user_id);
        const receiptData = {
            orderNumber: `JGT-${paymentId.toString().padStart(6, '0')}`,
            customerName: user ? user.fullName : '',
            customerEmail: user ? user.email : '',
            customerPhone: user ? user.phone : '',
            amount: payment.amount,
            items: JSON.parse(payment.items || '[]'),
            paymentMethod: payment.payment_method,
            bankAccount: payment.bank_account,
            bankName: payment.bank_name,
            status: payment.status,
            deliveryStatus: payment.delivery_status,
            deliveryDays: payment.delivery_days,
            estimatedDelivery: payment.estimated_delivery,
            createdAt: payment.created_at,
            shippingAddress: {
                fullName: payment.shipping_full_name,
                phone: payment.shipping_phone,
                address: payment.shipping_address,
                rt: payment.shipping_rt,
                rw: payment.shipping_rw,
                postalCode: payment.shipping_postal_code
            }
        };

        res.json(receiptData);
    } catch (error) {
        console.error('Get receipt error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Export to Excel endpoint (admin only, simplified)
app.get('/api/export', authenticateToken, (req, res) => {
    try {
        const users = loadFromExcel(USERS_FILE, 'Users');
        const payments = loadFromExcel(PAYMENTS_FILE, 'Payments');

        // Join payments with users and include shipping address
        const joinedData = payments.map(p => {
            const user = users.find(u => u.id === p.user_id);
            return {
                fullName: user ? user.fullName : '',
                email: user ? user.email : '',
                phone: user ? user.phone : '',
                amount: p.amount,
                items: p.items,
                payment_method: p.payment_method,
                status: p.status,
                created_at: p.created_at,
                shipping_full_name: p.shipping_full_name || '',
                shipping_phone: p.shipping_phone || '',
                shipping_address: p.shipping_address || '',
                shipping_rt: p.shipping_rt || '',
                shipping_rw: p.shipping_rw || '',
                shipping_postal_code: p.shipping_postal_code || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(joinedData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Payments');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename=payments.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Server error during export' });
    }
});

// Newsletter endpoint
app.post('/api/newsletter', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        // Load existing newsletter data from newsletter.xlsx
        const newsletterFile = path.join(__dirname, 'newsletter.xlsx');
        let newsletters = [];
        if (fs.existsSync(newsletterFile)) {
            newsletters = loadFromExcel(newsletterFile, 'Newsletter') || [];
        }

        const existingEmail = newsletters.find(n => n.email.toLowerCase() === email.toLowerCase());
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already subscribed' });
        }

        const newId = newsletters.length > 0 ? Math.max(...newsletters.map(n => n.id || 0)) + 1 : 1;
        const newSubscription = {
            id: newId,
            email: email.toLowerCase().trim(),
            subscribed_at: new Date().toISOString()
        };
        newsletters.push(newSubscription);

        // Save to newsletter.xlsx
        saveToExcel(newsletterFile, 'Newsletter', newsletters);

        res.status(201).json({ message: 'Email subscribed successfully', id: newId });
    } catch (error) {
        console.error('Newsletter subscription error:', error);
        res.status(500).json({ error: 'Server error during subscription' });
    }
});

// Contact form endpoint
app.post('/api/contact', (req, res) => {
    const { name, email, subject, message } = req.body;

    if (!name || !email || !subject || !message) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }

    try {
        // Load existing contact data from contact.xlsx
        const contactFile = path.join(__dirname, 'contact.xlsx');
        let contacts = [];
        if (fs.existsSync(contactFile)) {
            contacts = loadFromExcel(contactFile, 'Contact') || [];
        }

        const newId = contacts.length > 0 ? Math.max(...contacts.map(c => c.id || 0)) + 1 : 1;
        const newContact = {
            id: newId,
            name: name.trim(),
            email: email.toLowerCase().trim(),
            subject: subject.trim(),
            message: message.trim(),
            submitted_at: new Date().toISOString()
        };
        contacts.push(newContact);

        // Save to contact.xlsx
        saveToExcel(contactFile, 'Contact', contacts);

        res.status(201).json({ message: 'Message sent successfully', id: newId });
    } catch (error) {
        console.error('Contact form error:', error);
        res.status(500).json({ error: 'Server error during message submission' });
    }
});

// OAuth routes
app.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));

app.get('/auth/facebook/callback', passport.authenticate('facebook', { failureRedirect: '/login.html' }), (req, res) => {
    // Successful authentication, create JWT token and redirect
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, SECRET_KEY, { expiresIn: '24h' });
    res.redirect(`/index.html?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/login.html' }), (req, res) => {
    // Successful authentication, create JWT token and redirect
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, SECRET_KEY, { expiresIn: '24h' });
    res.redirect(`/index.html?token=${token}&user=${encodeURIComponent(JSON.stringify(req.user))}`);
});

// Get visitor statistics (admin only)
app.get('/api/visitors', authenticateToken, (req, res) => {
    try {
        const visitors = loadFromExcel(VISITORS_FILE, 'Visitors');

        // Group by country and count
        const countryStats = {};
        visitors.forEach(visitor => {
            const country = visitor.country || 'Unknown';
            countryStats[country] = (countryStats[country] || 0) + 1;
        });

        // Convert to array and sort by count descending
        const stats = Object.entries(countryStats).map(([country, count]) => ({
            country,
            count
        })).sort((a, b) => b.count - a.count);

        res.json({
            totalVisitors: visitors.length,
            uniqueCountries: stats.length,
            countryStats: stats
        });
    } catch (error) {
        console.error('Get visitors error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Public visitor counter
app.get('/api/visitor-count', (req, res) => {
    try {
        const visitors = loadFromExcel(VISITORS_FILE, 'Visitors');
        res.json({
            totalVisitors: visitors.length
        });
    } catch (error) {
        console.error('Get visitor count error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Function to get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost'; // Fallback
}

// Utility functions from check_lunas.js
function checkLunas() {
    const filePath = './lunas.xlsx';
    if (!fs.existsSync(filePath)) {
        console.log('lunas.xlsx does not exist');
        return;
    }

    try {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets['Lunas'];
        if (!sheet) {
            console.log('No Lunas sheet found');
            return;
        }

        const data = XLSX.utils.sheet_to_json(sheet);
        console.log('Number of records in lunas.xlsx:', data.length);
        if (data.length > 0) {
            console.log('First record:', data[0]);
            console.log('Last record:', data[data.length - 1]);
        }
    } catch (error) {
        console.error('Error reading lunas.xlsx:', error);
    }
}

// Utility functions from check_payments.js
function checkPayments() {
    const filePath = './payments.xlsx';
    if (!fs.existsSync(filePath)) {
        console.log('payments.xlsx does not exist');
        return;
    }

    try {
        const workbook = XLSX.readFile(filePath);
        const sheet = workbook.Sheets['Payments'];
        if (!sheet) {
            console.log('No Payments sheet found');
            return;
        }

        const data = XLSX.utils.sheet_to_json(sheet);
        console.log('Number of records in payments.xlsx:', data.length);
        if (data.length > 0) {
            console.log('First record:', data[0]);
            console.log('Last record:', data[data.length - 1]);
        }
    } catch (error) {
        console.error('Error reading payments.xlsx:', error);
    }
}

// Utility functions from sync_lunas.js
function syncLunas() {
    console.log('Syncing completed payments to lunas.xlsx...');

    // Load data
    const payments = loadFromExcel(PAYMENTS_FILE, 'Payments');
    const users = loadFromExcel(USERS_FILE, 'Users');
    let lunasData = loadFromExcel(LUNAS_FILE, 'Lunas');

    console.log(`Found ${payments.length} payments, ${users.length} users, ${lunasData.length} existing lunas records`);

    // Filter completed payments
    const completedPayments = payments.filter(p => p.status === 'completed');
    console.log(`Found ${completedPayments.length} completed payments`);

    // Check which are not in lunas yet
    const existingLunasIds = new Set(lunasData.map(l => l.id)); // Assuming id is payment id or something, but actually lunas doesn't have id
    // Lunas data doesn't have payment id, so we need to check by created_at or something
    // Since lunas is a copy, perhaps check by created_at and amount or something

    let added = 0;
    for (const payment of completedPayments) {
        // Check if already in lunas (by created_at and amount)
        const exists = lunasData.some(l => l.created_at === payment.created_at && l.amount === payment.amount);
        if (!exists) {
            const user = users.find(u => u.id === payment.user_id);
            const lunasRecord = {
                fullName: user ? user.fullName : '',
                email: user ? user.email : '',
                phone: user ? user.phone : '',
                amount: payment.amount,
                items: payment.items,
                payment_method: payment.payment_method,
                status: payment.status,
                created_at: payment.created_at,
                shipping_full_name: payment.shipping_full_name || '',
                shipping_phone: payment.shipping_phone || '',
                shipping_address: payment.shipping_address || '',
                shipping_rt: payment.shipping_rt || '',
                shipping_rw: payment.shipping_rw || '',
                shipping_postal_code: payment.shipping_postal_code || ''
            };
            lunasData.push(lunasRecord);
            added++;
        }
    }

    if (added > 0) {
        saveToExcel(LUNAS_FILE, 'Lunas', lunasData);
        console.log(`Added ${added} records to lunas.xlsx`);
    } else {
        console.log('No new records to add');
    }

    console.log(`lunas.xlsx now has ${lunasData.length} records`);
}

// Utility functions from test_payment.js and test_api.js
async function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ statusCode: res.statusCode, data: json });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testAPI() {
    try {
        console.log('Testing API endpoints...\n');

        // Test 1: Health check
        console.log('1. Testing health endpoint...');
        const healthResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/health',
            method: 'GET'
        });
        console.log('Health response:', healthResponse);
        console.log('');

        // Test 2: Register user
        console.log('2. Registering test user...');
        const registerResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/register',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        }, {
            fullName: 'Test User',
            email: 'test@example.com',
            phone: '123456789',
            password: 'password123'
        });
        console.log('Register response:', registerResponse);

        let token;
        if (registerResponse.statusCode === 201) {
            token = registerResponse.data.token;
        } else {
            // Try login if registration failed (user might already exist)
            console.log('Registration failed, trying login...');
            const loginResponse = await makeRequest({
                hostname: 'localhost',
                port: 3001,
                path: '/api/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            }, {
                username: 'test@example.com',
                password: 'password123'
            });
            console.log('Login response:', loginResponse);
            if (loginResponse.statusCode === 200) {
                token = loginResponse.data.token;
            }
        }
        console.log('');

        if (!token) {
            console.log('Could not obtain token, skipping payment tests');
            return;
        }

        // Test 3: Make payment
        console.log('3. Making test payment...');
        const paymentResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/payment',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        }, {
            amount: 100.00,
            items: [{ name: 'Test Item', price: 100, quantity: 1 }],
            paymentMethod: 'bank_transfer',
            bankAccount: '1234567890',
            bankName: 'Test Bank',
            shippingAddress: {
                fullName: 'Test User',
                phone: '123456789',
                address: 'Test Address',
                rt: '01',
                rw: '02',
                postalCode: '12345'
            }
        });
        console.log('Payment response:', paymentResponse);

        let paymentId;
        if (paymentResponse.statusCode === 201) {
            paymentId = paymentResponse.data.paymentId;
        }
        console.log('');

        if (!paymentId) {
            console.log('Could not create payment, skipping receipt test');
            return;
        }

        // Test 4: Get receipt
        console.log('4. Testing receipt endpoint...');
        const receiptResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: `/api/receipt/${paymentId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Receipt response:', receiptResponse);
        console.log('');

        // Test 5: Test export endpoint (should require auth)
        console.log('5. Testing export endpoint...');
        const exportResponse = await makeRequest({
            hostname: 'localhost',
            port: 3001,
            path: '/api/export',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        console.log('Export response status:', exportResponse.statusCode);
        console.log('Export response data type:', typeof exportResponse.data);
        console.log('');

        console.log('API testing completed.');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

async function testPayment() {
    try {
        console.log('Testing payment functionality...');

        // Register a test user
        console.log('1. Registering test user...');
        const registerOptions = {
            hostname: 'localhost',
            port: 3001,
            path: '/api/register',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const registerData = {
            fullName: 'Test User',
            email: 'test@example.com',
            phone: '123456789',
            password: 'password123'
        };

        const registerResponse = await makeRequest(registerOptions, registerData);
        console.log('Register response:', registerResponse);

        if (registerResponse.statusCode !== 201) {
            console.log('Registration failed, trying login...');
            // Try login instead
            const loginOptions = {
                hostname: 'localhost',
                port: 3001,
                path: '/api/login',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            };

            const loginData = {
                username: 'test@example.com',
                password: 'password123'
            };

            const loginResponse = await makeRequest(loginOptions, loginData);
            console.log('Login response:', loginResponse);

            if (loginResponse.statusCode !== 200) {
                console.log('Login failed, exiting...');
                return;
            }

            token = loginResponse.data.token;
        } else {
            token = registerResponse.data.token;
        }

        console.log('Token obtained:', token);

        // Make a payment
        console.log('2. Making payment...');
        const paymentOptions = {
            hostname: 'localhost',
            port: 3001,
            path: '/api/payment',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const paymentData = {
            amount: 100.00,
            items: [{ name: 'Test Item', price: 100, quantity: 1 }],
            paymentMethod: 'bank_transfer',
            bankAccount: '1234567890',
            bankName: 'Test Bank',
            shippingAddress: {
                fullName: 'Test User',
                phone: '123456789',
                address: 'Test Address',
                rt: '01',
                rw: '02',
                postalCode: '12345'
            }
        };

        const paymentResponse = await makeRequest(paymentOptions, paymentData);
        console.log('Payment response:', paymentResponse);

        console.log('Test completed.');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Test API endpoint
app.get('/api/test', (req, res) => {
    // Run the test asynchronously
    testAPI().then(() => {
        res.json({ message: 'API testing completed. Check server console for results.' });
    }).catch((error) => {
        console.error('Test API error:', error);
        res.status(500).json({ error: 'Test failed', details: error.message });
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Access from other devices using: http://${localIP}:${PORT}`);
    console.log('Excel files initialized at:', USERS_FILE, PAYMENTS_FILE, LUNAS_FILE, VISITORS_FILE);
});
