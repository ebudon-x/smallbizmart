// Shared functionality across all pages
let cart = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    updateCartCount();
    setActiveNavLink();

    // Load cart from localStorage if available
    const savedCart = localStorage.getItem('smallBizCart');
    if (savedCart) {
        cart = JSON.parse(savedCart);
        updateCartCount();
    }
});

// Update cart count in navigation
function updateCartCount() {
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        cartCount.textContent = totalItems;
    }
}

// Set active navigation link based on current page
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('nav a');

    navLinks.forEach(link => {
        const linkHref = link.getAttribute('href');
        if ((currentPage === 'index.html' && linkHref === '#home') || 
            (currentPage === linkHref)) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.className = `notification ${type}`;

    if (type === 'warning') {
        notification.style.backgroundColor = 'var(--warning-color)';
    } else if (type === 'error') {
        notification.style.backgroundColor = 'var(--accent-color)';
    } else {
        notification.style.backgroundColor = 'var(--success-color)';
    }

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Save cart to localStorage
function saveCartToStorage() {
    localStorage.setItem('smallBizCart', JSON.stringify(cart));
    updateCartCount();
}

// ============================================
// HOMEPAGE: Load ONLY seller-uploaded products from Firestore
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
    const productsGrid = document.getElementById("productsGrid");
    const loading = document.getElementById("loading");

    if (!productsGrid) return;

    // FIX: Only auto-load products on the homepage (index.html)
    // products.html has its own products.js loader
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage !== 'index.html' && currentPage !== '' && !currentPage.includes('index')) {
        if (loading) loading.style.display = "none";
        return;
    }

    loading.style.display = "flex";
    productsGrid.innerHTML = '';

    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
        const { getFirestore, collection, getDocs, query, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        const { firebaseConfig } = await import('./firebase-config.js');

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(8));
        const snapshot = await getDocs(q);

        const sellerProducts = [];
        snapshot.forEach(doc => {
            sellerProducts.push({ id: doc.id, ...doc.data() });
        });

        loading.style.display = "none";

        if (sellerProducts.length === 0) {
            productsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                    <h3>No Products Available Yet</h3>
                    <p>Be the first seller to upload a product!</p>
                    <a href="login.html" class="btn" style="margin-top: 1rem;">Start Selling</a>
                </div>
            `;
            return;
        }

        sellerProducts.forEach(product => {
            renderProductCard(product, productsGrid);
        });

    } catch (error) {
        console.error('Error loading products:', error);
        loading.style.display = "none";
        productsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <h3>Error Loading Products</h3>
                <p>Please check your internet connection and try again.</p>
            </div>
        `;
    }
});

// Renders product card
function renderProductCard(product, container) {
    const productCard = document.createElement("div");
    productCard.classList.add("product-card");

    let imgSrc = product.image || 'image/placeholder.jpg';
    if (typeof imgSrc === 'string' && imgSrc.startsWith('data:')) {
        imgSrc = 'image/placeholder.jpg';
    }
    // ===== FIXED: Also check for empty/invalid URLs =====
    if (!imgSrc || imgSrc === 'undefined' || imgSrc === 'null') {
        imgSrc = 'image/placeholder.jpg';
    }

    const productId = product.id || '';
    const productName = product.name || 'Unnamed Product';
    const productPrice = product.price || 0;
    const productDesc = product.description || '';
    const productCategory = product.category || 'general';

    const saved = JSON.parse(localStorage.getItem('sbm_saved') || '[]');
    const isLoved = saved.includes(productId);

    productCard.innerHTML = `
        <div style="position:relative;">
            <a href="product-detail.html?id=${productId}" style="text-decoration:none;color:inherit;">
                <img src="${imgSrc}" alt="${productName}" class="product-image" onerror="this.src='image/placeholder.jpg'">
            </a>
            <button class="save-btn" data-id="${productId}" title="Save item" 
                style="position:absolute;top:10px;right:10px;background:white;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,0.2);font-size:1.2rem;z-index:10;transition:transform 0.2s;">
                ${isLoved ? '❤️' : '🤍'}
            </button>
        </div>
        <div class="product-info">
            <div class="product-category">${productCategory.charAt(0).toUpperCase() + productCategory.slice(1)}</div>
            <a href="product-detail.html?id=${productId}" style="text-decoration:none;color:inherit;">
                <h3 class="product-title">${productName}</h3>
            </a>
            <p class="product-description">${productDesc}</p>
            <p class="product-stock">In Stock</p>
            <p class="product-price">₦${productPrice.toLocaleString()}</p>
            <button class="add-to-cart" onclick="event.stopPropagation();addToCartFromFirestore('${productId}', '${productName.replace(/'/g, "\'")}', ${productPrice}, '${imgSrc}')">Add to Cart</button>
        </div>
    `;

    container.appendChild(productCard);

    const saveBtn = productCard.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleSaveItem(productId, this);
        });
    }
}

// Toggle save/love item
window.toggleSaveItem = function(productId, btn) {
    let saved = JSON.parse(localStorage.getItem('sbm_saved') || '[]');
    const index = saved.indexOf(productId);

    if (index > -1) {
        saved.splice(index, 1);
        if (btn) btn.textContent = '🤍';
        showNotification('Removed from saved items', 'success');
    } else {
        saved.push(productId);
        if (btn) btn.textContent = '❤️';
        showNotification('Added to saved items', 'success');
    }

    localStorage.setItem('sbm_saved', JSON.stringify(saved));
};

// ===== FIXED: Update cart count immediately after adding =====
window.addToCartFromFirestore = async function(productId, name, price, image) {
    let cart = JSON.parse(localStorage.getItem('smallBizCart') || '[]');

    // FIXED: Use String comparison for Firestore IDs
    const existing = cart.find(item => String(item.id) === String(productId));
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: String(productId),
            name: name,
            price: price,
            image: image || 'image/placeholder.jpg',
            quantity: 1
        });
    }

    localStorage.setItem('smallBizCart', JSON.stringify(cart));

    // ===== FIXED: Immediately update cart count without refresh =====
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        cartCount.textContent = totalItems;
    }

    showNotification(`${name} added to cart!`, 'success');
};

// Legacy addToCart for backward compatibility
function addToCart(productId, quantity = 1) {
    console.warn('Legacy addToCart called - products now load from Firestore only');
    showNotification('Please refresh the page to see latest products', 'warning');
    return false;
}
