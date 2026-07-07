// Seller Dashboard - FREE version (no Firebase Storage needed)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    query,
    where,
    orderBy,
    onSnapshot,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    addDoc,
    serverTimestamp,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getDatabase,
    ref,
    onValue,
    onChildAdded,
    set,
    off,
    push,
    update
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const auth = getAuth(app);

let currentUser = null;
let currentSellerId = null;
let unsubscribers = [];

// Auth check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showNotification('Please sign in as a seller', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }

    currentUser = user;
    currentSellerId = user.uid;

    // Verify seller role
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.data();

    if (!userData || userData.role !== 'seller') {
        showNotification('Access denied. Seller account required.', 'error');
        setTimeout(() => window.location.href = 'index.html', 1500);
        return;
    }

    // Update sidebar with seller info
    document.getElementById('sellerAvatar').textContent = (userData.name || 'S').charAt(0).toUpperCase();
    document.getElementById('sellerName').textContent = userData.name || 'Seller';

    // Load dashboard data
    loadDashboardData(user.uid);
    loadProducts(user.uid);
    loadOrders(user.uid);
    loadMessages(user.uid);
    loadAnalytics(user.uid);

    // Set online status
    set(ref(rtdb, 'users/' + user.uid), {
        isOnline: true,
        lastSeen: Date.now(),
        name: userData.name || 'Seller'
    });
});

// Tab switching
document.querySelectorAll('.sidebar-menu a[data-tab]').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        switchTab(this.dataset.tab);
    });
});

function switchTab(tabName) {
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-menu a[data-tab="${tabName}"]`).classList.add('active');
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
}

// Load dashboard stats
async function loadDashboardData(sellerId) {
    try {
        const allOrders = await getDocs(collection(db, 'orders'));
        let totalSales = 0;
        let totalOrders = 0;

        allOrders.forEach(doc => {
            const order = doc.data();
            const sellerItems = order.items?.filter(item => item.sellerId === sellerId);
            if (sellerItems && sellerItems.length > 0) {
                totalOrders++;
                sellerItems.forEach(item => {
                    totalSales += item.price * item.quantity;
                });
            }
        });

        document.getElementById('totalSales').textContent = 'N' + totalSales.toLocaleString();
        document.getElementById('totalOrders').textContent = totalOrders;

        const productsQuery = query(collection(db, 'products'), where('sellerId', '==', sellerId));
        const productsSnap = await getDocs(productsQuery);
        document.getElementById('totalProducts').textContent = productsSnap.size;

        const reviewsQuery = query(collection(db, 'reviews'), where('sellerId', '==', sellerId));
        const reviewsSnap = await getDocs(reviewsQuery);
        let avgRating = 0;
        if (!reviewsSnap.empty) {
            let totalRating = 0;
            reviewsSnap.forEach(doc => totalRating += doc.data().rating);
            avgRating = (totalRating / reviewsSnap.size).toFixed(1);
        }
        document.getElementById('avgRating').textContent = avgRating || '0.0';

    } catch (error) {
        console.error('Dashboard data error:', error);
        document.getElementById('totalSales').textContent = 'N0';
        document.getElementById('totalOrders').textContent = '0';
        document.getElementById('totalProducts').textContent = '0';
        document.getElementById('avgRating').textContent = '0.0';
    }
}

// Load products
async function loadProducts(sellerId) {
    const container = document.getElementById('sellerProductsList');

    try {
        const productsQuery = query(
            collection(db, 'products'),
            where('sellerId', '==', sellerId)
        );

        const unsub = onSnapshot(productsQuery, (snapshot) => {
            if (snapshot.empty) {
                container.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No products yet. <a href="add-product.html">Add your first product</a></p>';
                return;
            }

            let html = '<table class="data-table"><thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
            snapshot.forEach(doc => {
                const p = doc.data();
                let imgSrc = p.image || 'image/placeholder.jpg';
                if (typeof imgSrc === 'string' && imgSrc.startsWith('data:')) {
                    imgSrc = 'image/placeholder.jpg';
                }

                html += `
                    <tr>
                        <td>
                            <img src="${imgSrc}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:0.5rem;" onerror="this.src='image/placeholder.jpg'">
                            ${p.name}
                        </td>
                        <td>N${p.price?.toLocaleString() || '0'}</td>
                        <td>${p.stock || 0}</td>
                        <td><span class="status-badge ${p.stock > 0 ? 'status-delivered' : 'status-cancelled'}">${p.stock > 0 ? 'Active' : 'Out of Stock'}</span></td>
                        <td>
                            <div class="action-btns">
                                <button class="action-btn edit" onclick="editProduct('${doc.id}')">Edit</button>
                                <button class="action-btn delete" onclick="deleteProduct('${doc.id}')">Delete</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
            html += '</tbody></table>';
            container.innerHTML = html;
        });

        unsubscribers.push(unsub);
    } catch (error) {
        console.error('Products error:', error);
        container.innerHTML = '<p style="text-align:center;color:#888;">Error loading products. Please refresh.</p>';
    }
}

// Load orders
async function loadOrders(sellerId) {
    const recentOrders = document.getElementById('recentOrders');
    const allOrdersEl = document.getElementById('allOrdersList');

    try {
        const ordersQuery = query(
            collection(db, 'orders'),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(ordersQuery, (snapshot) => {
            let sellerOrders = [];
            snapshot.forEach(doc => {
                const order = doc.data();
                const hasSellerItem = order.items?.some(item => item.sellerId === sellerId);
                if (hasSellerItem) {
                    sellerOrders.push({ id: doc.id, ...order });
                }
            });

            if (sellerOrders.length === 0) {
                recentOrders.innerHTML = '<p style="text-align:center;color:#888;">No orders yet.</p>';
                allOrdersEl.innerHTML = '<p style="text-align:center;color:#888;">No orders yet.</p>';
                return;
            }

            // Render recent (top 5)
            let recentHtml = '<table class="data-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Date</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>';
            sellerOrders.slice(0, 5).forEach(order => {
                const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Recently';
                recentHtml += `
                    <tr>
                        <td>${order.id}</td>
                        <td>${order.customer?.firstName || 'Guest'} ${order.customer?.lastName || ''}</td>
                        <td>${date}</td>
                        <td>N${order.total?.toLocaleString() || '0'}</td>
                        <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                        <td><button class="action-btn view" onclick="updateOrderStatus('${order.id}', 'processing')">Process</button></td>
                    </tr>
                `;
            });
            recentHtml += '</tbody></table>';
            recentOrders.innerHTML = recentHtml;

            // Render all orders
            let allHtml = '<table class="data-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>';
            sellerOrders.forEach(order => {
                const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Recently';
                allHtml += `
                    <tr>
                        <td>${order.id}</td>
                        <td>${order.customer?.firstName || 'Guest'}<br><small>${order.customer?.email || ''}</small></td>
                        <td>${order.items?.length || 0} items</td>
                        <td>N${order.total?.toLocaleString() || '0'}</td>
                        <td><span class="status-badge status-${order.status}">${order.status}</span></td>
                        <td>
                            <select onchange="updateOrderStatus('${order.id}', this.value)" style="padding:0.3rem;">
                                <option value="${order.status}" selected>${order.status}</option>
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="shipped">Shipped</option>
                                <option value="delivered">Delivered</option>
                                <option value="cancelled">Cancelled</option>
                            </select>
                        </td>
                    </tr>
                `;
            });
            allHtml += '</tbody></table>';
            allOrdersEl.innerHTML = allHtml;
        });

        unsubscribers.push(unsub);
    } catch (error) {
        console.error('Orders error:', error);
        recentOrders.innerHTML = '<p style="text-align:center;color:#888;">Error loading orders.</p>';
    }
}

// Load messages - shows NUMBER count, no icons
async function loadMessages(sellerId) {
    const messagesList = document.getElementById('messagesList');
    const msgBadge = document.getElementById('msgBadge');

    try {
        const chatsRef = ref(rtdb, 'chats');

        onValue(chatsRef, (snapshot) => {
            let unreadCount = 0;
            let chats = [];

            if (!snapshot.exists()) {
                messagesList.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No messages yet.</p>';
                if (msgBadge) {
                    msgBadge.textContent = '0';
                    msgBadge.style.display = 'none';
                }
                return;
            }

            snapshot.forEach((child) => {
                const chatData = child.val();
                if (child.key.includes(sellerId)) {
                    chats.push({
                        id: child.key,
                        ...chatData
                    });
                    // Count unread messages from buyers
                    if (chatData.lastMessage && !chatData.lastMessage.read && chatData.lastMessage.senderId !== sellerId) {
                        unreadCount++;
                    }
                }
            });

            // Show actual NUMBER count
            if (msgBadge) {
                msgBadge.textContent = unreadCount;
                msgBadge.style.display = unreadCount > 0 ? 'inline-block' : 'none';
            }

            if (chats.length === 0) {
                messagesList.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No messages yet.</p>';
                return;
            }

            // Sort by last message time
            chats.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));

            messagesList.innerHTML = '';
            chats.forEach(chat => {
                const lastMsg = chat.lastMessage || {};
                const isUnread = !lastMsg.read && lastMsg.senderId !== sellerId;
                const time = lastMsg.timestamp ? new Date(lastMsg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';

                const preview = document.createElement('div');
                preview.className = 'chat-preview' + (isUnread ? ' unread' : '');
                preview.onclick = () => openChat(chat.id, lastMsg.senderName || 'Customer', lastMsg.senderId);
                preview.innerHTML = `
                    <div class="chat-avatar">${(lastMsg.senderName || 'U').charAt(0).toUpperCase()}</div>
                    <div class="chat-info">
                        <h5>${lastMsg.senderName || 'Customer'}</h5>
                        <p>${lastMsg.text || 'No messages yet'}</p>
                    </div>
                    <div class="chat-meta">
                        <span class="time">${time}</span>
                        ${isUnread ? `<span class="badge">${chat.unreadCount || 1}</span>` : ''}
                    </div>
                `;
                messagesList.appendChild(preview);
            });
        });
    } catch (error) {
        console.error('Messages error:', error);
    }
}

// Load analytics
async function loadAnalytics(sellerId) {
    const analyticsDiv = document.getElementById('analytics');

    try {
        const ordersQuery = query(collection(db, 'orders'));
        const ordersSnap = await getDocs(ordersQuery);

        let monthlySales = {};
        let totalRevenue = 0;

        ordersSnap.forEach(doc => {
            const order = doc.data();
            const sellerItems = order.items?.filter(item => item.sellerId === sellerId);
            if (sellerItems && sellerItems.length > 0) {
                const date = order.createdAt?.toDate ? order.createdAt.toDate() : new Date();
                const monthKey = date.toLocaleString('default', { month: 'short', year: 'numeric' });

                if (!monthlySales[monthKey]) monthlySales[monthKey] = 0;
                sellerItems.forEach(item => {
                    monthlySales[monthKey] += item.price * item.quantity;
                    totalRevenue += item.price * item.quantity;
                });
            }
        });

        analyticsDiv.innerHTML = `
            <div class="dashboard-header">
                <h2>Sales Analytics</h2>
            </div>
            <div style="padding:2rem;text-align:center;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;margin-bottom:2rem;">
                    <div style="background:linear-gradient(135deg,var(--secondary-color),#2980b9);color:white;padding:1.5rem;border-radius:8px;">
                        <h2 style="font-size:2rem;">N${totalRevenue.toLocaleString()}</h2>
                        <p>Total Revenue</p>
                    </div>
                    <div style="background:linear-gradient(135deg,var(--success-color),#219653);color:white;padding:1.5rem;border-radius:8px;">
                        <h2 style="font-size:2rem;">${Object.keys(monthlySales).length}</h2>
                        <p>Active Months</p>
                    </div>
                </div>
                <div style="background:#f8f9fa;padding:1.5rem;border-radius:8px;text-align:left;">
                    <h4 style="margin-bottom:1rem;color:var(--primary-color);">Monthly Breakdown</h4>
                    ${Object.entries(monthlySales).length === 0 ? '<p style="color:#888;">No sales data yet.</p>' : 
                    Object.entries(monthlySales).map(([month, amount]) => `
                        <div style="display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid #eee;">
                            <span>${month}</span>
                            <strong>N${amount.toLocaleString()}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Analytics error:', error);
    }
}

// Actions
async function editProduct(productId) {
    showNotification('Edit product: ' + productId);
    window.location.href = 'add-product.html?edit=' + productId;
}

async function deleteProduct(productId) {
    if (!confirm('Are you sure you want to delete this product?')) return;

    try {
        await deleteDoc(doc(db, 'products', productId));
        showNotification('Product deleted successfully', 'success');
    } catch (error) {
        showNotification('Failed to delete product', 'error');
    }
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        await updateDoc(doc(db, 'orders', orderId), {
            status: newStatus,
            updatedAt: serverTimestamp()
        });
        showNotification('Order status updated to: ' + newStatus, 'success');
    } catch (error) {
        showNotification('Failed to update order', 'error');
    }
}

// ===== FIXED: Open chat modal - now matches buyer messages layout =====
let activeChatId = null;
let activeBuyerId = null;
let chatMessagesListener = null;
let onlineStatusListener = null;

function openChat(chatId, customerName, buyerId) {
    activeChatId = chatId;
    activeBuyerId = buyerId;

    let chatModal = document.getElementById('sellerChatModal');
    if (!chatModal) {
        chatModal = document.createElement('div');
        chatModal.id = 'sellerChatModal';
        chatModal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;';
        // ===== FIXED: Layout now matches buyer's messages.html =====
        chatModal.innerHTML = `
            <div style="background:white;width:90%;max-width:800px;height:85vh;border-radius:8px;display:flex;overflow:hidden;box-shadow:0 10px 40px rgba(0,0,0,0.3);">
                <!-- Chat List Sidebar -->
                <div style="width:280px;border-right:1px solid #eee;display:flex;flex-direction:column;background:#f8f9fa;">
                    <div style="padding:1rem;border-bottom:1px solid #eee;">
                        <h4 style="color:var(--primary-color);margin:0;">Conversations</h4>
                    </div>
                    <div id="chatModalSidebar" style="flex:1;overflow-y:auto;">
                        <p style="text-align:center;color:#888;padding:1rem;">Loading...</p>
                    </div>
                </div>
                <!-- Chat Window -->
                <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">
                    <div style="padding:1rem;background:#f8f9fa;border-bottom:1px solid #eee;display:flex;align-items:center;gap:1rem;">
                        <div id="chatModalAvatar" style="width:40px;height:40px;border-radius:50%;background:var(--secondary-color);color:white;display:flex;align-items:center;justify-content:center;font-weight:bold;">C</div>
                        <div style="flex:1;">
                            <h4 id="chatModalTitle" style="margin:0;color:var(--primary-color);">Chat</h4>
                            <span id="chatModalOnline" style="font-size:0.8rem;color:#27ae60;">🟢 Online</span>
                        </div>
                        <button onclick="closeChatModal()" style="background:none;border:none;color:#888;font-size:1.5rem;cursor:pointer;">&times;</button>
                    </div>
                    <div id="chatModalMessages" style="flex:1;overflow-y:auto;padding:1.5rem;background:#fafafa;display:flex;flex-direction:column;gap:1rem;"></div>
                    <div style="padding:1rem;border-top:1px solid #eee;display:flex;gap:0.5rem;background:white;">
                        <input type="text" id="chatModalInput" placeholder="Type your reply..." style="flex:1;padding:0.75rem;border:1px solid #ddd;border-radius:20px;outline:none;" onkeypress="if(event.key==='Enter') sendSellerReply()">
                        <button onclick="sendSellerReply()" style="padding:0.75rem 1.5rem;background:var(--secondary-color);color:white;border:none;border-radius:20px;cursor:pointer;font-weight:600;">Send</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(chatModal);
    }

    chatModal.style.display = 'flex';
    document.getElementById('chatModalTitle').textContent = customerName || 'Customer';
    document.getElementById('chatModalAvatar').textContent = (customerName || 'C').charAt(0).toUpperCase();

    // ===== FIXED: Listen to buyer's online status =====
    if (onlineStatusListener && activeBuyerId) {
        off(ref(rtdb, 'users/' + activeBuyerId), 'value', onlineStatusListener);
    }
    if (buyerId) {
        const buyerOnlineRef = ref(rtdb, 'users/' + buyerId);
        onValue(buyerOnlineRef, (snap) => {
            const data = snap.val();
            const onlineEl = document.getElementById('chatModalOnline');
            if (onlineEl && data) {
                if (data.isOnline) {
                    onlineEl.innerHTML = '🟢 Online';
                    onlineEl.style.color = '#27ae60';
                } else {
                    const lastSeen = data.lastSeen ? new Date(data.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
                    onlineEl.innerHTML = '⚪ Offline' + (lastSeen ? ' • Last seen ' + lastSeen : '');
                    onlineEl.style.color = '#888';
                }
            }
        });
    }

    // ===== FIXED: Load ALL messages (both sent and received) =====
    const messagesRef = ref(rtdb, 'chats/' + chatId + '/messages');
    const container = document.getElementById('chatModalMessages');
    container.innerHTML = '<p style="text-align:center;color:#888;">Loading messages...</p>';

    // Remove previous listener
    if (chatMessagesListener) {
        off(messagesRef, 'child_added', chatMessagesListener);
    }

    // Listen for ALL messages in real-time
    chatMessagesListener = onChildAdded(messagesRef, (snapshot) => {
        // Remove loading on first message
        if (container.querySelector('p')?.textContent === 'Loading messages...') {
            container.innerHTML = '';
        }

        const msg = snapshot.val();
        const isOwn = msg.senderId === currentSellerId;

        const div = document.createElement('div');
        div.style.cssText = 'max-width:70%;padding:0.75rem 1rem;border-radius:12px;font-size:0.95rem;line-height:1.4;word-wrap:break-word;' + 
            (isOwn 
                ? 'background:var(--secondary-color);color:white;margin-left:auto;border-bottom-right-radius:4px;' 
                : 'background:white;border:1px solid #e0e0e0;color:#333;border-bottom-left-radius:4px;');

        const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
        div.innerHTML = `
            <div>${escapeHtml(msg.text)}</div>
            <div style="font-size:0.7rem;opacity:0.7;margin-top:0.25rem;text-align:${isOwn ? 'right' : 'left'};">
                ${time} ${isOwn ? '• You' : '• ' + (msg.senderName || 'Customer')}
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    });

    // Also load existing messages once
    onValue(messagesRef, (snapshot) => {
        if (!snapshot.exists()) {
            container.innerHTML = '<p style="text-align:center;color:#888;">No messages yet.</p>';
        }
    }, { onlyOnce: true });

    // Mark as read
    update(ref(rtdb, 'chats/' + chatId + '/lastMessage'), { read: true }).catch(() => {});
}

window.closeChatModal = function() {
    const modal = document.getElementById('sellerChatModal');
    if (modal) modal.style.display = 'none';

    // Clean up listeners
    if (chatMessagesListener && activeChatId) {
        const messagesRef = ref(rtdb, 'chats/' + activeChatId + '/messages');
        off(messagesRef, 'child_added', chatMessagesListener);
        chatMessagesListener = null;
    }
    if (onlineStatusListener && activeBuyerId) {
        off(ref(rtdb, 'users/' + activeBuyerId), 'value', onlineStatusListener);
        onlineStatusListener = null;
    }
    activeChatId = null;
    activeBuyerId = null;
};

window.sendSellerReply = async function() {
    const input = document.getElementById('chatModalInput');
    const text = input.value.trim();
    const chatId = activeChatId;
    if (!text || !chatId || !currentSellerId) return;

    await push(ref(rtdb, 'chats/' + chatId + '/messages'), {
        text: text,
        senderId: currentSellerId,
        senderName: currentUser?.displayName || 'Seller',
        senderRole: 'seller',
        timestamp: Date.now(),
        read: false
    });

    await set(ref(rtdb, 'chats/' + chatId + '/lastMessage'), {
        text: text,
        senderId: currentSellerId,
        senderName: currentUser?.displayName || 'Seller',
        senderRole: 'seller',
        timestamp: Date.now(),
        read: false
    });

    input.value = '';
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Settings form
document.getElementById('storeSettingsForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    try {
        await updateDoc(doc(db, 'users', currentSellerId), {
            storeName: document.getElementById('storeName').value,
            storeDescription: document.getElementById('storeDesc').value,
            phone: document.getElementById('storePhone').value,
            address: document.getElementById('storeAddress').value,
            updatedAt: serverTimestamp()
        });
        showNotification('Settings saved successfully!', 'success');
    } catch (error) {
        showNotification('Failed to save settings', 'error');
    }
});

// Cleanup - set offline when leaving
window.addEventListener('beforeunload', () => {
    unsubscribers.forEach(unsub => unsub());
    if (currentSellerId) {
        set(ref(rtdb, 'users/' + currentSellerId), {
            isOnline: false,
            lastSeen: Date.now()
        });
    }
});

// Expose functions globally
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.updateOrderStatus = updateOrderStatus;
window.openChat = openChat;
window.switchTab = switchTab;
