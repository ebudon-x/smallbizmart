// Profile Page with Real Firebase Integration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    updateDoc,
    collection,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged,
    updateProfile,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let unsubscribers = [];

// Auth check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showNotification('Please sign in', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }

    currentUser = user;
    loadUserData(user.uid);
    loadOrders(user.uid);
    loadSavedItems();
    loadAddresses();
});

// Tab switching
document.querySelectorAll('.profile-menu a[data-tab]').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        document.querySelectorAll('.profile-menu a').forEach(a => a.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach(t => t.classList.remove('active'));
        document.getElementById(this.dataset.tab).classList.add('active');
    });
});

async function loadUserData(uid) {
    try {
        const userDoc = await getDoc(doc(db, 'users', uid));
        const userData = userDoc.data() || {};

        // Update sidebar
        const displayName = currentUser.displayName || userData.name || 'User';
        document.getElementById('profileName').textContent = displayName;
        document.getElementById('profileEmail').textContent = currentUser.email;
        document.getElementById('profileAvatar').textContent = displayName.charAt(0).toUpperCase();

        // Update info grid
        document.getElementById('infoName').textContent = displayName;
        document.getElementById('infoEmail').textContent = currentUser.email;
        document.getElementById('infoPhone').textContent = userData.phone || 'Not set';

        // Show real member since date
        let memberSince = 'July 2025';
        if (userData.createdAt) {
            const date = userData.createdAt.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
            memberSince = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        } else if (currentUser.metadata?.creationTime) {
            const date = new Date(currentUser.metadata.creationTime);
            memberSince = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }
        document.getElementById('infoJoined').textContent = memberSince;

        // Pre-fill edit form
        const nameParts = displayName.split(' ');
        document.getElementById('editFirstName').value = nameParts[0] || '';
        document.getElementById('editLastName').value = nameParts.slice(1).join(' ') || '';
        document.getElementById('editEmail').value = currentUser.email;
        document.getElementById('editPhone').value = userData.phone || '';

    } catch (error) {
        console.error('User data error:', error);
    }
}

async function loadOrders(uid) {
    const ordersList = document.getElementById('profileOrdersList');

    try {
        const ordersQuery = query(
            collection(db, 'orders'),
            where('customer.uid', '==', uid),
            orderBy('createdAt', 'desc')
        );

        const unsub = onSnapshot(ordersQuery, (snapshot) => {
            if (snapshot.empty) {
                ordersList.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">You have no orders yet.</p>';
                return;
            }

            ordersList.innerHTML = '';
            snapshot.forEach(doc => {
                const order = doc.data();
                const date = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString() : 'Recently';

                const div = document.createElement('div');
                div.style.cssText = 'padding:1rem;border-bottom:1px solid #eee;';
                div.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <strong>${doc.id}</strong>
                        <span class="status-badge status-${order.status}">${order.status}</span>
                    </div>
                    <p style="color:#888;font-size:0.9rem;">${date} | ₦${order.total?.toLocaleString() || '0'}</p>
                    <p style="font-size:0.85rem;">${order.items?.length || 0} items</p>
                `;
                ordersList.appendChild(div);
            });
        });

        unsubscribers.push(unsub);
    } catch (error) {
        console.error('Orders error:', error);
        ordersList.innerHTML = '<p style="text-align:center;color:#888;">Error loading orders.</p>';
    }
}

// Load saved items from localStorage + fetch product details from Firestore
async function loadSavedItems() {
    const savedItemsGrid = document.getElementById('savedItemsGrid');
    const savedIds = JSON.parse(localStorage.getItem('sbm_saved') || '[]');

    if (savedIds.length === 0) {
        savedItemsGrid.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;grid-column:1/-1;">No saved items yet. Browse products and click the heart icon to save!</p>';
        return;
    }

    savedItemsGrid.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;grid-column:1/-1;">Loading saved items...</p>';

    try {
        const { getDoc: getDocFS } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");

        const items = [];
        for (const id of savedIds) {
            const productDoc = await getDocFS(doc(db, 'products', id));
            if (productDoc.exists()) {
                items.push({ id: productDoc.id, ...productDoc.data() });
            }
        }

        if (items.length === 0) {
            savedItemsGrid.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;grid-column:1/-1;">No saved items found. They may have been removed.</p>';
            return;
        }

        savedItemsGrid.innerHTML = '';
        items.forEach(product => {
            let imgSrc = product.image || 'image/placeholder.jpg';
            if (typeof imgSrc === 'string' && imgSrc.startsWith('data:')) {
                imgSrc = 'image/placeholder.jpg';
            }

            const itemDiv = document.createElement('div');
            itemDiv.className = 'saved-item';
            itemDiv.innerHTML = `
                <img src="${imgSrc}" alt="${product.name}" onerror="this.src='image/placeholder.jpg'">
                <div class="saved-item-info">
                    <h5>${product.name || 'Unnamed'}</h5>
                    <p>₦${(product.price || 0).toLocaleString()}</p>
                    <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
                        <button class="btn" style="padding:0.4rem 0.8rem;font-size:0.8rem;flex:1;" onclick="addToCartFromSaved('${product.id}', '${(product.name || '').replace(/'/g, "\'")}', ${product.price || 0}, '${imgSrc}')">🛒 Add to Cart</button>
                        <button class="btn" style="padding:0.4rem 0.8rem;font-size:0.8rem;background:var(--accent-color);" onclick="removeSavedItem('${product.id}')">🗙 </button>
                    </div>
                </div>
            `;
            savedItemsGrid.appendChild(itemDiv);
        });
    } catch (error) {
        console.error('Saved items error:', error);
        savedItemsGrid.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;grid-column:1/-1;">Error loading saved items.</p>';
    }
}

// Add to cart from saved items
window.addToCartFromSaved = function(productId, name, price, image) {
    let cart = JSON.parse(localStorage.getItem('smallBizCart') || '[]');
    const existing = cart.find(item => item.id === productId);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ id: productId, name, price, image: image || 'image/placeholder.jpg', quantity: 1 });
    }
    localStorage.setItem('smallBizCart', JSON.stringify(cart));
    updateCartCount();
    showNotification(`${name} added to cart!`, 'success');
};

// Remove saved item
window.removeSavedItem = function(productId) {
    let saved = JSON.parse(localStorage.getItem('sbm_saved') || '[]');
    saved = saved.filter(id => id !== productId);
    localStorage.setItem('sbm_saved', JSON.stringify(saved));
    loadSavedItems();
    showNotification('Removed from saved items', 'success');
};

// ===== FIXED: Load addresses PER USER using UID key =====
function getAddressesKey() {
    return currentUser ? 'sbm_addresses_' + currentUser.uid : 'sbm_addresses_guest';
}

function loadAddresses() {
    const addressesList = document.getElementById('addressesList');
    const addresses = JSON.parse(localStorage.getItem(getAddressesKey()) || '[]');

    if (addresses.length === 0) {
        addressesList.innerHTML = '<p style="text-align:center;color:#888;padding:2rem;">No addresses saved yet.</p>';
        return;
    }

    addressesList.innerHTML = '';
    addresses.forEach((addr, index) => {
        const addrDiv = document.createElement('div');
        addrDiv.className = 'address-card' + (addr.isDefault ? ' default' : '');
        addrDiv.innerHTML = `
            ${addr.isDefault ? '<span class="badge-default">Default</span>' : ''}
            <h5>${addr.label || 'Address ' + (index + 1)}</h5>
            <p>${addr.street || ''}<br>${addr.city || ''}, ${addr.state || ''}<br>${addr.phone || ''}</p>
            <div class="address-actions">
                <button class="btn" style="padding:0.4rem 0.8rem;font-size:0.85rem;" onclick="editAddress(${index})">Edit</button>
                <button class="btn" style="padding:0.4rem 0.8rem;font-size:0.85rem;background:var(--accent-color);" onclick="deleteAddress(${index})">Delete</button>
                ${!addr.isDefault ? `<button class="btn" style="padding:0.4rem 0.8rem;font-size:0.85rem;" onclick="setDefaultAddress(${index})">Set Default</button>` : ''}
            </div>
        `;
        addressesList.appendChild(addrDiv);
    });
}

// Add new address modal
window.addNewAddress = function() {
    const modal = document.createElement('div');
    modal.id = 'addressModal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:white;padding:2rem;border-radius:8px;max-width:500px;width:90%;max-height:90vh;overflow-y:auto;">
            <h3 style="color:var(--primary-color);margin-bottom:1.5rem;">Add New Address</h3>
            <div class="form-group">
                <label>Label (e.g., Home, Office)</label>
                <input type="text" id="addrLabel" placeholder="Home">
            </div>
            <div class="form-group">
                <label>Street Address *</label>
                <input type="text" id="addrStreet" required placeholder="123 Main Street">
            </div>
            <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                <div class="form-group">
                    <label>City *</label>
                    <input type="text" id="addrCity" required>
                </div>
                <div class="form-group">
                    <label>State *</label>
                    <input type="text" id="addrState" required>
                </div>
            </div>
            <div class="form-group">
                <label>Phone Number</label>
                <input type="tel" id="addrPhone" placeholder="+234 800 000 0000">
            </div>
            <div class="form-group">
                <label><input type="checkbox" id="addrDefault"> Set as default address</label>
            </div>
            <div style="display:flex;gap:1rem;justify-content:flex-end;margin-top:1.5rem;">
                <button class="btn" style="background:#6c757d;" onclick="closeAddressModal()">Cancel</button>
                <button class="btn" onclick="saveAddress()">Save Address</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeAddressModal();
    });
};

window.closeAddressModal = function() {
    const modal = document.getElementById('addressModal');
    if (modal) modal.remove();
};

window.saveAddress = function() {
    const label = document.getElementById('addrLabel').value || 'Address';
    const street = document.getElementById('addrStreet').value;
    const city = document.getElementById('addrCity').value;
    const state = document.getElementById('addrState').value;
    const phone = document.getElementById('addrPhone').value;
    const isDefault = document.getElementById('addrDefault').checked;

    if (!street || !city || !state) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }

    const key = getAddressesKey();
    let addresses = JSON.parse(localStorage.getItem(key) || '[]');
    if (isDefault) {
        addresses.forEach(a => a.isDefault = false);
    }
    addresses.push({ label, street, city, state, phone, isDefault });
    localStorage.setItem(key, JSON.stringify(addresses));

    closeAddressModal();
    loadAddresses();
    showNotification('Address saved successfully!', 'success');
};

window.editAddress = function(index) {
    const key = getAddressesKey();
    const addresses = JSON.parse(localStorage.getItem(key) || '[]');
    const addr = addresses[index];
    addNewAddress();
    setTimeout(() => {
        document.getElementById('addrLabel').value = addr.label || '';
        document.getElementById('addrStreet').value = addr.street || '';
        document.getElementById('addrCity').value = addr.city || '';
        document.getElementById('addrState').value = addr.state || '';
        document.getElementById('addrPhone').value = addr.phone || '';
        document.getElementById('addrDefault').checked = addr.isDefault || false;
    }, 100);
    addresses.splice(index, 1);
    localStorage.setItem(key, JSON.stringify(addresses));
};

window.deleteAddress = function(index) {
    if (!confirm('Delete this address?')) return;
    const key = getAddressesKey();
    let addresses = JSON.parse(localStorage.getItem(key) || '[]');
    addresses.splice(index, 1);
    localStorage.setItem(key, JSON.stringify(addresses));
    loadAddresses();
    showNotification('Address deleted', 'success');
};

window.setDefaultAddress = function(index) {
    const key = getAddressesKey();
    let addresses = JSON.parse(localStorage.getItem(key) || '[]');
    addresses.forEach((a, i) => a.isDefault = (i === index));
    localStorage.setItem(key, JSON.stringify(addresses));
    loadAddresses();
    showNotification('Default address updated', 'success');
};

// Edit profile
document.getElementById('editProfileForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!currentUser) return;

    const firstName = document.getElementById('editFirstName').value;
    const lastName = document.getElementById('editLastName').value;
    const fullName = firstName + (lastName ? ' ' + lastName : '');
    const phone = document.getElementById('editPhone').value;

    try {
        await updateProfile(currentUser, { displayName: fullName });
        await updateDoc(doc(db, 'users', currentUser.uid), {
            name: fullName,
            phone: phone,
            updatedAt: serverTimestamp()
        });

        const stored = JSON.parse(localStorage.getItem('sbm_user') || '{}');
        stored.name = fullName;
        localStorage.setItem('sbm_user', JSON.stringify(stored));

        showNotification('Profile updated successfully!', 'success');
        loadUserData(currentUser.uid);

    } catch (error) {
        showNotification('Failed to update profile: ' + error.message, 'error');
    }
});

// Account settings - Password change with proper re-authentication
document.getElementById('accountSettingsForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const currentPassword = this.querySelector('input[placeholder="Current Password"]').value;
    const newPassword = this.querySelector('input[placeholder="New Password"]').value;
    const confirmPassword = this.querySelector('input[placeholder="Confirm New Password"]').value;

    if (newPassword && newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'error');
        return;
    }

    if (newPassword && newPassword.length < 6) {
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        if (newPassword && currentPassword) {
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);
            await updatePassword(currentUser, newPassword);
            showNotification('Password updated successfully!', 'success');

            this.querySelector('input[placeholder="Current Password"]').value = '';
            this.querySelector('input[placeholder="New Password"]').value = '';
            this.querySelector('input[placeholder="Confirm New Password"]').value = '';
        }

        const checkboxes = this.querySelectorAll('input[type="checkbox"]');
        const emailNotif = checkboxes[0]?.checked ?? true;
        const promoNotif = checkboxes[1]?.checked ?? true;

        await updateDoc(doc(db, 'users', currentUser.uid), {
            emailNotifications: emailNotif,
            promotionalEmails: promoNotif
        });

        if (!newPassword) {
            showNotification('Settings saved!', 'success');
        }

    } catch (error) {
        let msg = 'Failed: ';
        if (error.code === 'auth/invalid-credential') {
            msg += 'Current password is incorrect.';
        } else if (error.code === 'auth/requires-recent-login') {
            msg += 'Please log in again before changing your password.';
        } else {
            msg += error.message;
        }
        showNotification(msg, 'error');
    }
});

// Logout button in profile sidebar
document.getElementById('logoutBtn').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
        await signOut(auth);
    } catch (err) {
        console.log('Firebase signout:', err);
    }
    localStorage.removeItem('sbm_user');
    localStorage.removeItem('smallBizCart');
    localStorage.removeItem('sbm_saved');
    localStorage.removeItem('sbm_orders');
    sessionStorage.clear();
    showNotification('Logged out successfully', 'success');
    setTimeout(() => window.location.href = 'index.html', 1000);
});

// Cleanup
window.addEventListener('beforeunload', () => {
    unsubscribers.forEach(unsub => unsub());
});
