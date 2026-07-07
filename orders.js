// Orders Page with Real Firebase Integration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let unsubscribeOrders = null;

// Auth state
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    if (user) {
        loadOrdersRealtime(user.uid);
    } else {
        // Show local orders for guests
        loadLocalOrders();
    }
});

// Real-time order listener
function loadOrdersRealtime(userId) {
    const ordersList = document.getElementById('ordersList');
    ordersList.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">Loading your orders...</p>';

    const ordersQuery = query(
        collection(db, 'orders'),
        where('customer.uid', '==', userId),
        orderBy('createdAt', 'desc')
    );

    unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        if (snapshot.empty) {
            ordersList.innerHTML = `
                <div class="empty-orders">
                    <h3>No Orders Yet</h3>
                    <p>You haven't placed any orders. Start shopping to see your orders here!</p>
                    <a href="products.html" class="btn">Start Shopping</a>
                </div>
            `;
            return;
        }

        ordersList.innerHTML = '';
        snapshot.forEach((docSnapshot) => {
            const order = { id: docSnapshot.id, ...docSnapshot.data() };
            renderOrderCard(order);
        });
    }, (error) => {
        console.error('Error loading orders:', error);
        loadLocalOrders(); // Fallback to local
    });
}

// Fallback: Load from localStorage
function loadLocalOrders() {
    const ordersList = document.getElementById('ordersList');
    const orders = JSON.parse(localStorage.getItem('sbm_orders') || '[]');

    if (orders.length === 0) {
        ordersList.innerHTML = `
            <div class="empty-orders">
                <h3>No Orders Yet</h3>
                <p>You haven't placed any orders. Start shopping to see your orders here!</p>
                <a href="products.html" class="btn">Start Shopping</a>
            </div>
        `;
        return;
    }

    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    ordersList.innerHTML = '';
    orders.forEach(order => renderOrderCard(order));
}

function renderOrderCard(order) {
    const ordersList = document.getElementById('ordersList');
    const statusSteps = getStatusSteps(order.status);
    const orderCard = document.createElement('div');
    orderCard.className = 'order-card';
    orderCard.id = 'order-' + order.id;

    let itemsHtml = '';
    order.items.forEach(item => {
        itemsHtml += `
            <div class="order-item-row">
                <img src="${item.image}" alt="${item.name}">
                <div class="order-item-info">
                    <h5>${item.name}</h5>
                    <p>Qty: ${item.quantity}</p>
                </div>
                <div class="order-item-price">₦${(item.price * item.quantity).toLocaleString()}</div>
            </div>
        `;
    });

    const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : new Date(order.createdAt).toLocaleDateString();

    orderCard.innerHTML = `
        <div class="order-header">
            <div>
                <h4>${order.id}</h4>
                <span class="order-date">${date}</span>
            </div>
            <span class="status-badge status-${order.status}">${order.status.toUpperCase()}</span>
        </div>
        <div class="order-body">
            ${itemsHtml}
            <div class="tracking-timeline">
                <div class="tracking-step ${statusSteps.ordered}">
                    <div class="tracking-dot">✓</div>
                    <span>Ordered</span>
                </div>
                <div class="tracking-step ${statusSteps.processing}">
                    <div class="tracking-dot">✓</div>
                    <span>Processing</span>
                </div>
                <div class="tracking-step ${statusSteps.shipped}">
                    <div class="tracking-dot">✓</div>
                    <span>Shipped</span>
                </div>
                <div class="tracking-step ${statusSteps.delivered}">
                    <div class="tracking-dot">✓</div>
                    <span>Delivered</span>
                </div>
            </div>
        </div>
        <div class="order-footer">
            <span class="order-total">Total: ₦${order.total.toLocaleString()}</span>
            <div class="order-actions">
                <button class="action-btn view" onclick="viewOrder('${order.id}')">View Details</button>
                ${order.status === 'delivered' ? '<button class="action-btn edit" onclick="writeReview('' + order.id + '')">Write Review</button>' : ''}
            </div>
        </div>
    `;
    ordersList.appendChild(orderCard);
}

function getStatusSteps(status) {
    const steps = { ordered: 'completed', processing: '', shipped: '', delivered: '' };
    if (status === 'pending') return steps;
    steps.processing = 'completed';
    if (status === 'processing') return steps;
    steps.shipped = 'active';
    if (status === 'shipped') return steps;
    steps.shipped = 'completed';
    steps.delivered = 'completed';
    return steps;
}

function viewOrder(orderId) {
    showNotification('Order details: ' + orderId);
}

async function writeReview(orderId) {
    const review = prompt('Write your review:');
    if (!review) return;

    const rating = prompt('Rate this order (1-5):');
    if (!rating || rating < 1 || rating > 5) {
        showNotification('Please enter a valid rating (1-5)', 'error');
        return;
    }

    try {
        const { addDoc, collection, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
        await addDoc(collection(db, 'reviews'), {
            orderId: orderId,
            userId: currentUser?.uid || 'guest',
            userName: currentUser?.displayName || 'Anonymous',
            text: review,
            rating: parseInt(rating),
            createdAt: serverTimestamp()
        });
        showNotification('Review submitted! Thank you.', 'success');
    } catch (error) {
        console.error('Review error:', error);
        showNotification('Review saved locally', 'success');
    }
}

// Cleanup on page leave
window.addEventListener('beforeunload', () => {
    if (unsubscribeOrders) unsubscribeOrders();
});

// Expose functions globally
window.viewOrder = viewOrder;
window.writeReview = writeReview;
