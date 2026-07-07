// Cart page functionality
// FIXED: Use the shared cart array from main.js instead of redeclaring it
// main.js already declares: let cart = [];

document.addEventListener('DOMContentLoaded', function() {
    // Initialize cart from localStorage FIRST (main.js may not have loaded cart yet)
    const savedCart = localStorage.getItem('smallBizCart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }
    displayCartPage();
});

function displayCartPage() {
    const cartContent = document.getElementById('cartContent');

    if (!cartContent) return;

    if (cart.length === 0) {
        cartContent.innerHTML = `
            <div class="empty-cart-page">
                <h3>Your cart is empty</h3>
                <p>Looks like you haven't added any items to your cart yet.</p>
                <a href="products.html" class="btn">Continue Shopping</a>
            </div>
        `;
        return;
    }

    let subtotal = 0;
    const shippingFee = 1500;
    let total = 0;

    // Calculate totals
    cart.forEach(item => {
        subtotal += item.price * item.quantity;
    });
    total = subtotal + shippingFee;

    cartContent.innerHTML = `
        <div class="cart-summary">
            <h2>Cart Items (${cart.length})</h2>
            <div class="cart-items" id="cartItemsPage">
                <!-- Cart items will be loaded here -->
            </div>
        </div>

        <div class="cart-totals">
            <h3>Order Summary</h3>
            <div class="total-row">
                <span>Subtotal:</span>
                <span>&#8358;${subtotal.toLocaleString()}</span>
            </div>
            <div class="total-row">
                <span>Shipping Fee:</span>
                <span>&#8358;${shippingFee.toLocaleString()}</span>
            </div>
            <div class="total-row final">
                <span>Total:</span>
                <span>&#8358;${total.toLocaleString()}</span>
            </div>
        </div>

        <div class="cart-actions">
            <a href="products.html" class="continue-shopping">Continue Shopping</a>
            <button class="checkout-page" id="checkoutPage">Proceed to Checkout</button>
        </div>
    `;

    // Display cart items
    const cartItemsPage = document.getElementById('cartItemsPage');
    if (cartItemsPage) {
        cartItemsPage.innerHTML = '';
        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            // FIXED: Use String() instead of parseInt for Firestore string IDs
            const itemId = String(item.id);
            const cartItem = document.createElement('div');
            cartItem.className = 'cart-item';
            cartItem.innerHTML = `
                <div class="cart-item-info">
                    <img src="${item.image}" alt="${item.name}" class="cart-item-image" onerror="this.src='image/placeholder.jpg'">
                    <div class="cart-item-details">
                        <h4>${item.name}</h4>
                        <p class="cart-item-price">&#8358;${item.price.toLocaleString()}</p>
                    </div>
                </div>
                <div class="cart-item-controls">
                    <div class="quantity-control">
                        <button class="quantity-btn minus" data-id="${itemId}">-</button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="quantity-btn plus" data-id="${itemId}">+</button>
                    </div>
                    <div style="text-align: right;">
                        <p style="font-weight: bold; margin-bottom: 0.5rem;">&#8358;${itemTotal.toLocaleString()}</p>
                        <button class="remove-item" data-id="${itemId}">Remove</button>
                    </div>
                </div>
            `;
            cartItemsPage.appendChild(cartItem);
        });
    }

    // Add event listeners AFTER elements are in DOM
    setupCartEventListeners();

    // Checkout button
    const checkoutBtn = document.getElementById('checkoutPage');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', function() {
            if (cart.length === 0) {
                showNotification('Your cart is empty!', 'warning');
                return;
            }
            window.location.href = 'checkout.html';
        });
    }
}

function setupCartEventListeners() {
    // Quantity buttons - use event delegation for reliability
    document.querySelectorAll('.quantity-btn.minus').forEach(button => {
        button.addEventListener('click', function() {
            // FIXED: Keep as string, don't use parseInt
            const id = this.getAttribute('data-id');
            updateQuantity(id, -1);
        });
    });

    document.querySelectorAll('.quantity-btn.plus').forEach(button => {
        button.addEventListener('click', function() {
            // FIXED: Keep as string, don't use parseInt
            const id = this.getAttribute('data-id');
            updateQuantity(id, 1);
        });
    });

    document.querySelectorAll('.remove-item').forEach(button => {
        button.addEventListener('click', function() {
            // FIXED: Keep as string, don't use parseInt
            const id = this.getAttribute('data-id');
            removeFromCart(id);
        });
    });
}

// FIXED: Use loose equality (==) to handle both string and number IDs
function updateQuantity(productId, change) {
    // Try to find by string comparison (handles both string and number IDs)
    const item = cart.find(item => String(item.id) === String(productId));

    if (item) {
        item.quantity += change;

        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            saveCartToStorage();
            displayCartPage();
        }
    }
}

// FIXED: Use loose equality for removal too
function removeFromCart(productId) {
    cart = cart.filter(item => String(item.id) !== String(productId));
    saveCartToStorage();
    displayCartPage();
    showNotification('Item removed from cart', 'warning');
}

// FIXED: Ensure cart count update works across all pages
function saveCartToStorage() {
    localStorage.setItem('smallBizCart', JSON.stringify(cart));
    // Update cart count in nav if it exists
    const cartCount = document.getElementById('cartCount');
    if (cartCount) {
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        cartCount.textContent = totalItems;
    }
    // Also update mobile cart count
    const mobileCartCount = document.getElementById('mobileCartCount');
    if (mobileCartCount) {
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        mobileCartCount.textContent = totalItems;
    }
}
