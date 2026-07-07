// Checkout with Real Firebase Integration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    serverTimestamp,
    doc,
    updateDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;

// Check auth state
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        // Pre-fill email
        document.getElementById('checkoutEmail').value = user.email || '';
    }
});

// Load cart items
document.addEventListener('DOMContentLoaded', function() {
    // FIXED: Initialize cart from localStorage
    let cart = [];
    const savedCart = localStorage.getItem('smallBizCart');
    if (savedCart) {
        try {
            cart = JSON.parse(savedCart);
        } catch (e) {
            cart = [];
        }
    }

    const orderItems = document.getElementById('orderItems');
    const summarySubtotal = document.getElementById('summarySubtotal');
    const summaryTotal = document.getElementById('summaryTotal');

    if (cart.length === 0) {
        orderItems.innerHTML = '<p style="text-align:center;color:#888;padding:1rem;">Your cart is empty. <a href="products.html">Continue shopping</a></p>';
        document.getElementById('placeOrderBtn').disabled = true;
        return;
    }

    let subtotal = 0;
    const shipping = 1500;

    orderItems.innerHTML = '';
    cart.forEach(item => {
        subtotal += item.price * item.quantity;
        const itemDiv = document.createElement('div');
        itemDiv.className = 'order-item';
        itemDiv.innerHTML = `
            <img src="${item.image}" alt="${item.name}">
            <div class="order-item-info">
                <h5>${item.name}</h5>
                <p>Qty: ${item.quantity}</p>
            </div>
            <div class="order-item-price">₦${(item.price * item.quantity).toLocaleString()}</div>
        `;
        orderItems.appendChild(itemDiv);
    });

    summarySubtotal.textContent = '₦' + subtotal.toLocaleString();
    summaryTotal.textContent = '₦' + (subtotal + shipping).toLocaleString();
});

// Payment method selection
document.querySelectorAll('.payment-method').forEach(method => {
    method.addEventListener('click', function() {
        document.querySelectorAll('.payment-method').forEach(m => m.classList.remove('selected'));
        this.classList.add('selected');

        const methodType = this.dataset.method;
        document.getElementById('cardFields').style.display = methodType === 'card' ? 'block' : 'none';
        document.getElementById('transferFields').style.display = methodType === 'transfer' ? 'block' : 'none';
    });
});

// Place order
document.getElementById('placeOrderBtn').addEventListener('click', async function() {
    const btn = this;

    // Validation
    const email = document.getElementById('checkoutEmail').value;
    const phone = document.getElementById('checkoutPhone').value;
    const firstName = document.getElementById('firstName').value;
    const lastName = document.getElementById('lastName').value;
    const address = document.getElementById('address').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;

    if (!email || !phone || !firstName || !lastName || !address || !city || !state) {
        showNotification('Please fill in all required fields.', 'error');
        return;
    }

    if (cart.length === 0) {
        showNotification('Your cart is empty!', 'error');
        return;
    }

    btn.textContent = 'Processing...';
    btn.disabled = true;

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const shipping = 1500;
    const total = subtotal + shipping;

    const orderData = {
        items: cart.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            image: item.image,
            category: item.category
        })),
        customer: { 
            uid: currentUser?.uid || 'guest',
            email, 
            phone, 
            firstName, 
            lastName, 
            address, 
            city, 
            state,
            zip: document.getElementById('zip').value || ''
        },
        subtotal,
        shipping,
        total,
        status: 'pending',
        paymentMethod: document.querySelector('.payment-method.selected').dataset.method,
        notes: document.getElementById('orderNotes').value,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    try {
        // Save to Firestore
        const docRef = await addDoc(collection(db, 'orders'), orderData);

        // Save order ID for tracking
        const orderWithId = { ...orderData, id: docRef.id, createdAt: new Date().toISOString() };

        // Also save to localStorage for quick access
        const orders = JSON.parse(localStorage.getItem('sbm_orders') || '[]');
        orders.push(orderWithId);
        localStorage.setItem('sbm_orders', JSON.stringify(orders));

        // Clear cart
        localStorage.setItem('smallBizCart', JSON.stringify([]));
        // Update cart count
        const cartCount = document.getElementById('cartCount');
        if (cartCount) cartCount.textContent = '0';
        const mobileCartCount = document.getElementById('mobileCartCount');
        if (mobileCartCount) mobileCartCount.textContent = '0';

        showNotification('Order placed successfully! Order ID: ' + docRef.id, 'success');

        setTimeout(() => {
            window.location.href = 'orders.html';
        }, 2000);
    } catch (error) {
        console.error('Order error:', error);
        showNotification('Failed to place order. Please try again.', 'error');
        btn.textContent = 'Place Order';
        btn.disabled = false;
    }
});
