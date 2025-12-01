// Toast Notification System
class Toast {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        if (!document.querySelector('.toast-container')) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        } else {
            this.container = document.querySelector('.toast-container');
        }
    }

    show(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };

        toast.innerHTML = `
            <div class="toast-content">
                <span class="toast-icon">${icons[type] || icons.info}</span>
                <span class="toast-message">${message}</span>
            </div>
            <button class="toast-close">&times;</button>
            <div class="toast-progress"></div>
        `;

        this.container.appendChild(toast);

        // Close button event
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => this.remove(toast));

        // Auto remove after duration
        setTimeout(() => this.remove(toast), duration);

        // Animation
        setTimeout(() => toast.classList.add('fade-out'), duration - 300);
    }

    remove(toast) {
        toast.classList.add('fade-out');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }
}

// Global toast instance
const toast = new Toast();

// Skrip untuk bilah navigasi (dilengkapi ARIA + keyboard support)
const bar = document.getElementById('bar');
const close = document.getElementById('close');
const nav = document.getElementById('navbar');

// Ensure ARIA attributes for accessibility
if (bar) {
    bar.setAttribute('role', 'button');
    bar.tabIndex = 0;
    bar.setAttribute('aria-controls', 'navbar');
    bar.setAttribute('aria-expanded', 'false');
}
if (nav) {
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-hidden', nav.classList.contains('active') ? 'false' : 'true');
}
if (close) {
    close.setAttribute('role', 'button');
    close.tabIndex = 0;
    close.setAttribute('aria-label', 'Close menu');
}

function addBackdrop() {
    if (!document.getElementById('mobile-backdrop')) {
        const bd = document.createElement('div');
        bd.id = 'mobile-backdrop';
        bd.style.position = 'fixed';
        bd.style.left = '0';
        bd.style.top = '0';
        bd.style.right = '0';
        bd.style.bottom = '0';
        bd.style.background = 'rgba(0,0,0,0.3)';
        bd.style.zIndex = '9998';
        bd.addEventListener('click', () => {
            closeMenu();
        });
        document.body.appendChild(bd);
    }
}

function removeBackdrop() {
    const bd = document.getElementById('mobile-backdrop');
    if (bd) bd.remove();
}

function openMenu() {
    if (!nav) return;
    nav.classList.add('active');
    document.body.classList.add('menu-open');
    bar && bar.setAttribute('aria-expanded', 'true');
    nav.setAttribute('aria-hidden', 'false');
    addBackdrop();
    // focus first focusable element inside nav for keyboard users
    const first = nav.querySelector('a, button, input, [tabindex]:not([tabindex="-1"])');
    if (first) first.focus();
}

function closeMenu() {
    if (!nav) return;
    nav.classList.remove('active');
    document.body.classList.remove('menu-open');
    bar && bar.setAttribute('aria-expanded', 'false');
    nav.setAttribute('aria-hidden', 'true');
    removeBackdrop();
}

function toggleMenu() {
    if (!nav) return;
    if (nav.classList.contains('active')) closeMenu(); else openMenu();
}

if (bar) {
    bar.addEventListener('click', () => toggleMenu());
    // Allow Enter and Space to toggle menu
    bar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            toggleMenu();
        }
        if (e.key === 'Escape') closeMenu();
    });
}
if (close) {
    close.addEventListener('click', () => closeMenu());
    close.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            closeMenu();
        }
    });
}

// Close menu with Escape from anywhere
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (nav && nav.classList.contains('active')) closeMenu();
    }
});

// Update cart icon badge count in header
function updateCartBadge() {
    const cartCount = getCartItemCount();
    let badge = document.querySelector('#lg-bag .cart-count-badge');
    if (!badge) {
        const cartIconLink = document.querySelector('#lg-bag a');
        if (!cartIconLink) return;
        badge = document.createElement('span');
        badge.className = 'cart-count-badge';
        cartIconLink.appendChild(badge);
    }
    badge.textContent = cartCount;
    // Also update the simpler badge element used in header markup (#cart-count)
    const simple = document.getElementById('cart-count');
    if (simple) simple.textContent = cartCount;
}

// Get total quantity of items in cart
function getCartItemCount() {
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    let count = 0;
    cart.forEach(item => {
        count += item.quantity;
    });
    return count;
}

// Add event listeners for all Add to Cart buttons on index.html
function setupAddToCartButtons() {
    const buttons = document.querySelectorAll('.add-to-cart-btn');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            const productDiv = this.closest('.pro');
            const id = productDiv.getAttribute('data-id');
            const name = productDiv.getAttribute('data-name');
            const price = parseInt(productDiv.getAttribute('data-price'));
            const img = productDiv.getAttribute('data-img');
            const quantity = 1;

            let cart = JSON.parse(localStorage.getItem('cart')) || [];

            // Check if item already exists in cart (by id)
            const existingItem = cart.find(item => item.id === id);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                cart.push({ id, name, price, img, quantity, color: '', size: '' });
            }

            localStorage.setItem('cart', JSON.stringify(cart));
            updateCartBadge();
            toast.show(`"${name}" berhasil ditambahkan ke keranjang!`, 'success');
        });
    });
}

// Fungsi untuk menangani login/logout link
function handleLoginLogout() {
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userName = localStorage.getItem('userName');
    const loginLink = document.getElementById('login-link');

    if (loginLink) {
        if (isLoggedIn === 'true' && userName) {
            // Jika sudah login, ubah link menjadi "Logout" dengan styling
            loginLink.textContent = 'Logout';
            loginLink.classList.add('logged-in', 'logout-btn');
            loginLink.href = '#';
            loginLink.addEventListener('click', function(e) {
                e.preventDefault();
                // Logout
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('userName');
                localStorage.removeItem('profilePhoto');
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('cart');
                toast.show('Anda telah logout.', 'info');
                location.reload();
            });
        } else {
            // Jika belum login, pastikan styling default
            loginLink.textContent = 'Login';
            loginLink.classList.remove('logged-in', 'logout-btn');
            loginLink.href = 'login.html';
        }
    }
}

// Initialize functionalities on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    handleLoginLogout();

    // Set up Add to Cart buttons on index page
    setupAddToCartButtons();

    // Update cart badge count in header
    updateCartBadge();

    // Cek parameter URL untuk notifikasi pembayaran sukses (jika ada)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        const method = urlParams.get('method');
        const shipping = urlParams.get('shipping');

        const methodNames = {
            'gopay': 'GoPay',
            'ovo': 'OVO',
            'dana': 'DANA',
            'shopeepay': 'ShopeePay',
            'bank': 'Bank BNI'
        };

        const methodName = methodNames[method] || 'Metode Pembayaran';

        let shippingDays = 1; // Default
        if (shipping) {
            try {
                const shippingData = JSON.parse(decodeURIComponent(shipping));
                shippingDays = shippingData.shippingDays || 1;
            } catch (e) {
                console.log('Error parsing shipping data:', e);
            }
        }

        const estimatedArrival = new Date(Date.now() + shippingDays * 24 * 60 * 60 * 1000).toLocaleDateString('id-ID');
        toast.show(`Pembayaran ${methodName} berhasil! Pesanan Anda akan diproses dan dikirim dalam ${shippingDays} hari. Estimasi tiba: ${estimatedArrival}. Terima kasih atas pembelian Anda! 🎉`, 'success', 5000);

        // Hapus parameter dari URL setelah menampilkan alert
        window.history.replaceState(null, null, window.location.pathname);
    }

    // Check for OAuth callback parameters
    const token = urlParams.get('token');
    const userParam = urlParams.get('user');

    if (token && userParam) {
        try {
            const user = JSON.parse(decodeURIComponent(userParam));
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(user));
            localStorage.setItem('isLoggedIn', 'true');
            const firstName = user.fullName.split(' ')[0];
            localStorage.setItem('userName', firstName);

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);

            alert('Login berhasil! Selamat datang, ' + firstName + '.');
        } catch (error) {
            console.error('Error parsing OAuth callback:', error);
            alert('Terjadi kesalahan saat login OAuth.');
        }
    }

    // Load visitor count
    loadVisitorCount();
});

/* ===== Shop page search/filter ===== */
function debounce(fn, wait) {
    let t;
    return function(...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function setupShopSearch() {
    const input = document.getElementById('shop-search-input');
    const clearBtn = document.getElementById('shop-search-clear');
    const noResults = document.getElementById('shop-no-results');
    const container = document.querySelector('#product1 .pro-container');
    if (!input || !container) return;

    const products = Array.from(container.querySelectorAll('.pro'));

    function applyFilter() {
        const qRaw = input.value.trim().toLowerCase();
        if (qRaw === '') {
            // reset
            products.forEach(p => p.style.display = '');
            if (noResults) noResults.style.display = 'none';
            return;
        }

        // split tokens, remove empty
        const tokens = qRaw.split(/\s+/).filter(Boolean);

        // synonym map to expand common category words
        const synonyms = {
            'sepatu': ['sepatu', 'sneaker', 'sneakers', 'shoe', 'shoes'],
            'sendal': ['sendal', 'sandal', 'sandal'],
            'jaket': ['jaket', 'jacket', 'coat'],
            'celana': ['celana', 'pants', 'trousers', 'shorts'],
            'tas': ['tas', 'bag', 'tote', 'backpack'],
            'baju': ['baju', 'shirt', 't-shirt', 'kaos', 'clothing', 'tops'],
            'topi': ['hat','topi'],
            'dompet': ['wallet','dompet']
        };

        // expanded tokens include synonyms when token matches a key
        const expanded = new Set(tokens);
        tokens.forEach(t => {
            if (synonyms[t]) synonyms[t].forEach(s => expanded.add(s));
        });

        let matches = 0;
        products.forEach(p => {
            const title = (p.querySelector('.des h5') && p.querySelector('.des h5').textContent) || '';
            const brand = (p.querySelector('.des span') && p.querySelector('.des span').textContent) || '';
            const price = (p.querySelector('.des h4') && p.querySelector('.des h4').textContent) || '';
            const img = (p.querySelector('img') && p.querySelector('img').getAttribute('src')) || '';
            const link = (p.querySelector('a') && p.querySelector('a').getAttribute('href')) || '';
            const dataTags = (p.getAttribute('data-tags') || '') + ' ' + (p.getAttribute('data-category') || '');

            // haystack of searchable text
            const hay = (title + ' ' + brand + ' ' + price + ' ' + img + ' ' + link + ' ' + dataTags).toLowerCase();

            // If any expanded token is found in hay, consider it a match
            let isMatch = false;
            for (const t of expanded) {
                if (t && hay.indexOf(t) !== -1) { isMatch = true; break; }
            }

            // Fallback: allow partial substring match of whole query
            if (!isMatch && hay.indexOf(qRaw) !== -1) isMatch = true;

            if (isMatch) {
                p.style.display = '';
                matches++;
            } else {
                p.style.display = 'none';
            }
        });

        if (noResults) noResults.style.display = matches === 0 ? 'block' : 'none';
    }

    const debounced = debounce(applyFilter, 220);
    input.addEventListener('input', debounced);
    clearBtn && clearBtn.addEventListener('click', function(e) {
        e.preventDefault();
        input.value = '';
        applyFilter();
        input.focus();
    });

    // allow Enter key to focus first matching product (accessibility)
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            const first = container.querySelector('.pro:not([style*="display: none"]) a');
            if (first) {
                first.focus();
            }
        }
    });
}

// Initialize shop search when DOM ready
document.addEventListener('DOMContentLoaded', function() {
    try {
        setupShopSearch();
    } catch (err) {
        console.error('Error initializing shop search', err);
    }
});

/* ===== Pending Orders Sync =====
   Tries to send locally-stored pending orders to the server when online.
   Runs on `online` event and periodically (every 60 seconds).
*/
document.addEventListener('DOMContentLoaded', function() {
    async function trySyncPendingOrders() {
        const pendingRaw = localStorage.getItem('pendingOrders');
        if (!pendingRaw) return;
        let pending = [];
        try {
            pending = JSON.parse(pendingRaw || '[]');
        } catch (e) {
            console.error('Invalid pendingOrders in localStorage', e);
            return;
        }

        if (!Array.isArray(pending) || pending.length === 0) return;

        const token = localStorage.getItem('token');
        const apiBase = 'http://192.168.1.10:3000'; // same as checkout

        for (let i = 0; i < pending.length; i++) {
            const order = pending[i];
            try {
                // Attempt to send each pending order
                const res = await fetch(`${apiBase}/api/payment`, {
                    method: 'POST',
                    headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { 'Authorization': `Bearer ${token}` } : {}),
                    body: JSON.stringify({
                        amount: order.amount,
                        items: order.items,
                        paymentMethod: order.paymentMethod || 'cash',
                        bankAccount: order.bankAccount || '',
                        bankName: order.bankName || '',
                        shippingAddress: order.shippingAddress || {}
                    })
                });

                if (!res.ok) {
                    // Server responded but with error; keep order for retry and log
                    const errText = await res.text().catch(() => '');
                    console.warn('Pending order not accepted by server:', res.status, errText);
                    continue;
                }

                // On success, remove this order from local pending list
                pending.splice(i, 1);
                i--; // adjust index after removal
                localStorage.setItem('pendingOrders', JSON.stringify(pending));
                toast.show('Pesanan pending berhasil disinkronkan ke server.', 'success', 4000);
            } catch (error) {
                // Network error or fetch failed; stop trying now
                console.error('Gagal mengirim pending order:', error);
                // Keep remaining orders for next attempt
                return;
            }
        }

        // If all cleared, remove key
        if (pending.length === 0) {
            localStorage.removeItem('pendingOrders');
        }
    }

    // Expose function to global scope so other pages (receipt.html) can trigger a manual sync
    window.trySyncPendingOrders = trySyncPendingOrders;

    // Try sync when browser becomes online
    window.addEventListener('online', () => {
        console.info('Browser online — mencoba sinkronisasi pending orders');
        trySyncPendingOrders();
    });

    // Try sync immediately on load (in case connection exists)
    trySyncPendingOrders();

    // Periodic retry every 60 seconds while page is open
    setInterval(() => {
        if (navigator.onLine) trySyncPendingOrders();
    }, 60000);
});


// Cek status login saat halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    handleLoginLogout();

    // Cek parameter URL untuk notifikasi pembayaran sukses (jika ada)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('payment') === 'success') {
        const method = urlParams.get('method');
        const shipping = urlParams.get('shipping');

        const methodNames = {
            'gopay': 'GoPay',
            'ovo': 'OVO',
            'dana': 'DANA',
            'shopeepay': 'ShopeePay',
            'bank': 'Bank BNI'
        };

        const methodName = methodNames[method] || 'Metode Pembayaran';

        let shippingDays = 1; // Default
        if (shipping) {
            try {
                const shippingData = JSON.parse(decodeURIComponent(shipping));
                shippingDays = shippingData.shippingDays || 1;
            } catch (e) {
                console.log('Error parsing shipping data:', e);
            }
        }

        const estimatedArrival = new Date(Date.now() + shippingDays * 24 * 60 * 60 * 1000).toLocaleDateString('id-ID');
        toast.show(`Pembayaran ${methodName} berhasil! Pesanan Anda akan diproses dan dikirim dalam ${shippingDays} hari. Estimasi tiba: ${estimatedArrival}. Terima kasih atas pembelian Anda! 🎉`, 'success', 5000);

        // Hapus parameter dari URL setelah menampilkan alert
        window.history.replaceState(null, null, window.location.pathname);
    }
});

// Fungsi untuk menghapus item dari keranjang
document.addEventListener('DOMContentLoaded', function() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    const grandTotal = document.getElementById('grand-total');

    // Muat keranjang dari localStorage
    function loadCart() {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        cartItemsContainer.innerHTML = '';
        let total = 0;

        cart.forEach((item, index) => {
            const subtotal = item.price * item.quantity;
            total += subtotal;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><a href="#" class="remove-item" data-index="${index}"><i class="fas fa-times-circle"></i></a></td>
                <td><img src="${item.img}" alt=""></td>
                <td>${item.name}</td>
                <td>${item.color || '-'}</td>
                <td>${item.size || '-'}</td>
                <td class="price">${item.price}</td>
                <td><input type="number" value="${item.quantity}" class="quantity-input" min="1" data-index="${index}"></td>
                <td class="subtotal">${subtotal.toLocaleString('id-ID')}</td>
            `;
            cartItemsContainer.appendChild(row);
        });

        cartTotal.textContent = 'Rp.' + total.toLocaleString('id-ID');
        grandTotal.textContent = 'Rp.' + total.toLocaleString('id-ID');

        // Tambahkan pendengar acara untuk tombol hapus
        document.querySelectorAll('.remove-item').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const index = parseInt(this.getAttribute('data-index'));
                removeFromCart(index);
            });
        });

        // Tambahkan pendengar acara untuk input quantity
        document.querySelectorAll('.quantity-input').forEach(input => {
            input.addEventListener('change', function() {
                const index = parseInt(this.getAttribute('data-index'));
                const quantity = parseInt(this.value);
                if (quantity > 0) {
                    updateQuantity(index, quantity);
                } else {
                    this.value = 1;
                    updateQuantity(index, 1);
                }
            });
        });
    }

    // Hapus item dari keranjang
    function removeFromCart(index) {
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        cart.splice(index, 1);
        localStorage.setItem('cart', JSON.stringify(cart));
        loadCart();
    }

    // Perbarui jumlah
    function updateQuantity(index, quantity) {
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        if (quantity > 0) {
            cart[index].quantity = quantity;
            localStorage.setItem('cart', JSON.stringify(cart));
            loadCart();
        }
    }

    // Muat keranjang saat halaman dimuat (hanya jika elemen ada)
    if (cartItemsContainer) {
        loadCart();
    }

    // Function to render cart cards (used for all devices now)
    function renderCartCards() {
        const cartItemsMobile = document.getElementById('cart-items-mobile');
        if (!cartItemsMobile) return;

        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        cartItemsMobile.innerHTML = '';

        cart.forEach((item, index) => {
            const subtotal = item.price * item.quantity;
            const card = document.createElement('div');
            card.className = 'cart-item-card';
            card.innerHTML = `
                <div class="item-header">
                    <img src="${item.img}" alt="${item.name}" class="item-image">
                    <div class="item-details">
                        <h4>${item.name}</h4>
                        <div class="item-info">
                            <span>Warna: ${item.color || '-'}</span>
                            <span>Ukuran: ${item.size || '-'}</span>
                        </div>
                    </div>
                </div>
                <div class="item-price">Rp.${item.price.toLocaleString('id-ID')}</div>
                <div class="item-controls">
                    <div class="quantity-controls">
                        <label>Jumlah:</label>
                        <input type="number" value="${item.quantity}" class="quantity-input-mobile" min="1" data-index="${index}">
                    </div>
                    <div class="item-subtotal">Rp.${subtotal.toLocaleString('id-ID')}</div>
                </div>
                <button class="remove-btn" data-index="${index}">Hapus</button>
            `;
            cartItemsMobile.appendChild(card);
        });

        // Add event listeners for cart cards
        document.querySelectorAll('.quantity-input-mobile').forEach(input => {
            input.addEventListener('change', function() {
                const index = parseInt(this.getAttribute('data-index'));
                const quantity = parseInt(this.value);
                if (quantity > 0) {
                    updateQuantity(index, quantity);
                    renderCartCards(); // Re-render cart cards after update
                } else {
                    this.value = 1;
                    updateQuantity(index, 1);
                    renderCartCards(); // Re-render cart cards after update
                }
            });
        });

        document.querySelectorAll('.remove-btn').forEach(button => {
            button.addEventListener('click', function() {
                const index = parseInt(this.getAttribute('data-index'));
                removeFromCart(index);
                renderCartCards(); // Re-render cart cards after removal
            });
        });
    }

    // Load cart cards if on cart page
    if (document.getElementById('cart-items-mobile')) {
        renderCartCards();
    }

    // Fungsi tambah ke keranjang (untuk halaman produk) - sudah diupdate di sproduct.html, jadi ini untuk halaman lain jika perlu
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    const productElement = document.querySelector('.single-pro');
    const quantityInput = document.getElementById('quantity-input');
    const colorSelectElement = document.getElementById('color-select');
    const sizeSelectElement = document.getElementById('size-select');

    if (addToCartBtn && productElement && quantityInput) {
        // Cek jika sudah ada script di halaman (seperti di sproduct.html), jangan duplikat
        if (!addToCartBtn.hasAttribute('data-handled')) {
            addToCartBtn.setAttribute('data-handled', 'true');
            addToCartBtn.addEventListener('click', function() {
                const id = productElement.getAttribute('data-id');
                const name = productElement.getAttribute('data-name');
                const price = parseInt(productElement.getAttribute('data-price'));
                const img = productElement.getAttribute('data-img');
                const quantity = parseInt(quantityInput.value);
                const color = colorSelectElement ? colorSelectElement.value : '';
                const size = sizeSelectElement ? sizeSelectElement.value : '';

                // Validasi sederhana
                if (isNaN(quantity) || quantity <= 0) {
                    alert('Jumlah harus lebih dari 0!');
                    return;
                }
                if (colorSelectElement && !color) {
                    alert('Silakan pilih warna terlebih dahulu!');
                    return;
                }
                if (sizeSelectElement && (!size || size === 'Select Size')) {
                    alert('Silakan pilih ukuran terlebih dahulu!');
                    return;
                }

                // Gunakan gambar sesuai warna yang dipilih
                let selectedImg = img;
                if (colorSelectElement && color) {
                    const selectedOption = colorSelectElement.options[colorSelectElement.selectedIndex];
                    const imgSrc = selectedOption.getAttribute('data-img');
                    if (imgSrc) {
                        selectedImg = imgSrc;
                    }
                }

                let cart = JSON.parse(localStorage.getItem('cart')) || [];

                // Cek item yang sama (id, warna, ukuran)
                const existingItem = cart.find(item => item.id === id && item.color === color && item.size === size);
                if (existingItem) {
                    existingItem.quantity += quantity;
                } else {
                    cart.push({ id, name, price, img: selectedImg, quantity, color, size });
                }

                localStorage.setItem('cart', JSON.stringify(cart));
                alert('Produk ditambahkan ke keranjang!');
            });
        }
    }

    // Fungsi ganti gambar (untuk halaman produk)
    const mainimg = document.getElementById("mainimg");
    const smalling = document.getElementsByClassName("small-img");

    if (mainimg && smalling.length > 0) {
        for (let i = 0; i < smalling.length; i++) {
            smalling[i].onclick = function() {
                mainimg.src = smalling[i].src;
            };
        }
    }

    // Fungsi ganti gambar berdasarkan warna
    const colorSelect = document.getElementById('color-select');
    if (colorSelect) {
        colorSelect.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const imgSrc = selectedOption.getAttribute('data-img');
            if (imgSrc && mainimg) {
                mainimg.src = imgSrc;
            }
        });
    }

    // Newsletter form submission
    const newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
        newsletterForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = this.email.value.trim();
            if (!email) {
                toast.show('Silakan masukkan email Anda.', 'warning');
                return;
            }
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                toast.show('Silakan masukkan email yang valid.', 'error');
                return;
            }
            try {
                const response = await fetch('/api/newsletter', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });
                const result = await response.json();
                if (response.ok) {
                    toast.show('Terima kasih! Email Anda telah terdaftar untuk newsletter.', 'success');
                    this.reset();
                } else {
                    toast.show('Error: ' + result.error, 'error');
                }
            } catch (error) {
                console.error('Newsletter submission error:', error);
                toast.show('Terjadi kesalahan saat mendaftar. Silakan coba lagi.', 'error');
            }
        });
    }
});

async function loadVisitorCount() {
    try {
        const response = await fetch('http://192.168.1.10:3000/api/visitor-count');
        if (response.ok) {
            const data = await response.json();
            const visitorCountElement = document.getElementById('visitor-count');
            if (visitorCountElement) {
                // Animate the counter
                animateCounter(visitorCountElement, data.totalVisitors);
            }
        } else {
            console.error('Failed to load visitor count');
        }
    } catch (error) {
        console.error('Error loading visitor count:', error);
    }
}

function animateCounter(element, target) {
    let current = 0;
    const increment = target / 100; // Adjust speed here
    const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = Math.floor(current).toLocaleString();
    }, 20);
}
