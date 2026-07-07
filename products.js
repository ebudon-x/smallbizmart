// products.js - Loads ONLY seller-uploaded products from Firestore
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    getDocs,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let allProducts = [];

document.addEventListener('DOMContentLoaded', async function() {
    await loadProductsFromFirestore();
    setupFilters();
    applyFilters();
});

async function loadProductsFromFirestore() {
    const loading = document.getElementById('loading');
    const productsGrid = document.getElementById('productsGrid');

    if (loading) loading.style.display = 'flex';
    if (productsGrid) productsGrid.innerHTML = '';

    try {
        const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        allProducts = [];
        snapshot.forEach(doc => {
            allProducts.push({ id: doc.id, ...doc.data() });
        });

    } catch (error) {
        console.error('Error loading products:', error);
        allProducts = [];
    }

    if (loading) loading.style.display = 'none';
}

function setupFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const sortBy = document.getElementById('sortBy');
    const search = document.getElementById('search');

    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (sortBy) sortBy.addEventListener('change', applyFilters);
    if (search) search.addEventListener('input', () => {
        clearTimeout(window.filterTimeout);
        window.filterTimeout = setTimeout(applyFilters, 300);
    });
}

function applyFilters() {
    const categoryFilter = document.getElementById('categoryFilter');
    const sortBy = document.getElementById('sortBy');
    const search = document.getElementById('search');

    let filtered = [...allProducts];

    const category = categoryFilter ? categoryFilter.value : 'all';
    if (category && category !== 'all') {
        filtered = filtered.filter(p => p.category === category);
    }

    const q = search ? search.value.trim().toLowerCase() : '';
    if (q) {
        filtered = filtered.filter(p =>
            (p.name || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q)
        );
    }

    const sortVal = sortBy ? sortBy.value : 'featured';
    switch (sortVal) {
        case 'price-low':
            filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
            break;
        case 'price-high':
            filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
            break;
        case 'name':
            filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
        default:
            filtered.sort((a, b) => (b.featured === true) - (a.featured === true));
            break;
    }

    displayProducts(filtered);
}

function displayProducts(list) {
    const productsGrid = document.getElementById('productsGrid');
    const resultsCount = document.getElementById('resultsCount');

    if (!productsGrid) return;

    productsGrid.innerHTML = '';

    if (resultsCount) {
        resultsCount.textContent = `Showing ${list.length} products`;
    }

    if (list.length === 0) {
        productsGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <h3>No products found</h3>
                <p>${allProducts.length === 0 ? 'No seller has uploaded products yet. Be the first!' : 'Try adjusting your filters or search terms.'}</p>
                ${allProducts.length === 0 ? '<a href="login.html" class="btn" style="margin-top: 1rem;">Start Selling</a>' : '<button onclick="clearFilters()" class="btn" style="margin-top: 1rem;">Clear All Filters</button>'}
            </div>
        `;
        return;
    }

    const categoryNames = {
        'fashion': 'Fashion', 'home': 'Home & Decor', 'food': 'Food & Beverages',
        'beauty': 'Beauty & Care', 'arts': 'Arts & Crafts', 
        'accessories': 'Accessories', 'health': 'Health & Wellness'
    };

    const saved = JSON.parse(localStorage.getItem('sbm_saved') || '[]');

    list.forEach(product => {
        let imgSrc = product.image || 'image/placeholder.jpg';
        if (typeof imgSrc === 'string' && imgSrc.startsWith('data:')) {
            imgSrc = 'image/placeholder.jpg';
        }
        // ===== FIXED: Also check for empty/invalid URLs =====
        if (!imgSrc || imgSrc === 'undefined' || imgSrc === 'null') {
            imgSrc = 'image/placeholder.jpg';
        }

        const isLoved = saved.includes(product.id);

        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            ${product.featured ? '<span class="product-featured">Featured</span>' : ''}
            <div style="position:relative;">
                <a href="product-detail.html?id=${product.id}" style="text-decoration:none;color:inherit;">
                    <img src="${imgSrc}" alt="${product.name}" class="product-image" onerror="this.src='image/placeholder.jpg'">
                </a>
                <button class="save-btn" data-id="${product.id}" title="Save item" 
                    style="position:absolute;top:10px;right:10px;background:white;border:none;border-radius:50%;width:36px;height:36px;cursor:pointer;box-shadow:0 2px 5px rgba(0,0,0,0.2);font-size:1.2rem;z-index:10;transition:transform 0.2s;">
                    ${isLoved ? '❤️' : '🤍'}
                </button>
            </div>
            <div class="product-info">
                <div class="product-category">${categoryNames[product.category] || product.category || 'General'}</div>
                <a href="product-detail.html?id=${product.id}" style="text-decoration:none;color:inherit;">
                    <h3 class="product-title">${product.name}</h3>
                </a>
                <p class="product-description">${product.description || ''}</p>
                <p class="product-stock">In Stock</p>
                <p class="product-price">₦${(product.price || 0).toLocaleString()}</p>
                <button class="add-to-cart" data-id="${product.id}" data-name="${product.name.replace(/"/g, '&quot;')}" data-price="${product.price}" data-image="${imgSrc}">Add to Cart</button>
            </div>
        `;
        productsGrid.appendChild(productCard);
    });

    productsGrid.querySelectorAll('.save-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const productId = this.getAttribute('data-id');
            toggleSaveItem(productId, this);
        });
    });

    productsGrid.querySelectorAll('.add-to-cart').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const id = this.getAttribute('data-id');
            const name = this.getAttribute('data-name');
            const price = parseFloat(this.getAttribute('data-price'));
            const image = this.getAttribute('data-image');
            addToCartFromProductsPage(id, name, price, image);
        });
    });
}

function toggleSaveItem(productId, btn) {
    let saved = JSON.parse(localStorage.getItem('sbm_saved') || '[]');
    const index = saved.indexOf(productId);

    if (index > -1) {
        saved.splice(index, 1);
        btn.textContent = '🤍';
        showNotification('Removed from saved items', 'success');
    } else {
        saved.push(productId);
        btn.textContent = '❤️';
        showNotification('Added to saved items', 'success');
    }

    localStorage.setItem('sbm_saved', JSON.stringify(saved));
}

// ===== FIXED: Update cart count immediately =====
function addToCartFromProductsPage(productId, name, price, image) {
    let cart = JSON.parse(localStorage.getItem('smallBizCart') || '[]');

    // FIXED: Use String comparison and store as string
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

    // ===== FIXED: Immediately update cart count =====
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        const total = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCount.textContent = total;
    }

    if (typeof showNotification === 'function') {
        showNotification(`${name} added to cart!`, 'success');
    }
}

window.clearFilters = function() {
    const categoryFilter = document.getElementById('categoryFilter');
    const sortBy = document.getElementById('sortBy');
    const search = document.getElementById('search');
    if (categoryFilter) categoryFilter.value = 'all';
    if (sortBy) sortBy.value = 'featured';
    if (search) search.value = '';
    applyFilters();
};

console.log('Products script loaded - seller products only.');
