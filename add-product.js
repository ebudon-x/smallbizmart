// Add/Edit Product - with Firebase Integration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;
let imageFiles = [];
let editingProductId = null;
let existingImages = [];

// Check for edit mode
const urlParams = new URLSearchParams(window.location.search);
editingProductId = urlParams.get('edit');

// Auth check
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showNotification('Please sign in as a seller', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return;
    }
    currentUser = user;

    // If editing, load product data
    if (editingProductId) {
        await loadProductForEdit(editingProductId);
    }
});

// Load product data for editing
async function loadProductForEdit(productId) {
    try {
        const productDoc = await getDoc(doc(db, 'products', productId));
        if (!productDoc.exists()) {
            showNotification('Product not found', 'error');
            return;
        }

        const product = productDoc.data();

        // Verify seller owns this product
        if (product.sellerId !== currentUser.uid) {
            showNotification('You do not have permission to edit this product', 'error');
            setTimeout(() => window.location.href = 'seller-dashboard.html', 1500);
            return;
        }

        // Fill form fields
        document.getElementById('productName').value = product.name || '';
        document.getElementById('productCategory').value = product.category || '';
        document.getElementById('productPrice').value = product.price || '';
        document.getElementById('productStock').value = product.stock || '';
        document.getElementById('productCondition').value = product.condition || 'new';
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('featuredProduct').checked = product.featured || false;

        // Update page title and button
        document.querySelector('.product-form-container h2').textContent = 'Edit Product';
        document.querySelector('button[type="submit"]').textContent = 'Update Product';

        // Show existing images
        existingImages = product.images || [];
        if (product.image && product.image !== 'image/placeholder.jpg') {
            if (!existingImages.includes(product.image)) {
                existingImages.unshift(product.image);
            }
        }

        const imagePreview = document.getElementById('imagePreview');
        imagePreview.innerHTML = '';
        existingImages.forEach(imgUrl => {
            const img = document.createElement('img');
            img.src = imgUrl;
            img.style.cssText = 'width:100%;height:100px;object-fit:cover;border-radius:4px;';
            img.onerror = function() { this.src = 'image/placeholder.jpg'; };
            imagePreview.appendChild(img);
        });

        showNotification('Product loaded for editing', 'success');
    } catch (error) {
        console.error('Error loading product:', error);
        showNotification('Failed to load product', 'error');
    }
}

// Image upload preview
const imageUpload = document.getElementById('imageUpload');
const productImages = document.getElementById('productImages');
const imagePreview = document.getElementById('imagePreview');

imageUpload.addEventListener('click', () => productImages.click());

productImages.addEventListener('change', function() {
    imagePreview.innerHTML = '';
    imageFiles = [];

    Array.from(this.files).slice(0, 5).forEach(file => {
        imageFiles.push(file);
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = document.createElement('img');
            img.src = e.target.result;
            imagePreview.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
});

// Drag and drop
imageUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageUpload.style.borderColor = 'var(--secondary-color)';
});

imageUpload.addEventListener('dragleave', () => {
    imageUpload.style.borderColor = '#ddd';
});

imageUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    imageUpload.style.borderColor = '#ddd';
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/')).slice(0, 5);
    const dataTransfer = new DataTransfer();
    files.forEach(file => dataTransfer.items.add(file));
    productImages.files = dataTransfer.files;
    productImages.dispatchEvent(new Event('change'));
});

// Compress image to reduce size
function compressImage(file, maxWidth = 800, quality = 0.7) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedDataUrl);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Upload to Imgur anonymous
async function uploadToImgur(base64Image) {
    const base64Data = base64Image.split(',')[1];

    const response = await fetch('https://api.imgur.com/3/image', {
        method: 'POST',
        headers: {
            'Authorization': 'Client-ID 546c25a59c58ad7',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            image: base64Data,
            type: 'base64'
        })
    });

    const data = await response.json();
    if (data.success) {
        return data.data.link;
    } else {
        throw new Error(data.data?.error || 'Imgur upload failed');
    }
}

// Form submission - handles both ADD and EDIT
 document.getElementById('addProductForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!currentUser) {
        showNotification('Please sign in first', 'error');
        return;
    }

    const btn = this.querySelector('button[type="submit"]');
    const originalText = btn.textContent;
    btn.textContent = editingProductId ? 'Updating...' : 'Publishing...';
    btn.disabled = true;

    try {
        // Get seller info
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data() || {};

        // Handle images
        let mainImage = existingImages.length > 0 ? existingImages[0] : 'image/placeholder.jpg';
        let imageUrls = [...existingImages];

        if (imageFiles.length > 0) {
            showNotification('Compressing and uploading images...', 'warning');
            imageUrls = []; // New images replace old ones

            for (let i = 0; i < imageFiles.length; i++) {
                try {
                    const compressed = await compressImage(imageFiles[i]);
                    try {
                        const url = await uploadToImgur(compressed);
                        imageUrls.push(url);
                    } catch (imgurErr) {
                        console.warn('Imgur failed, using placeholder:', imgurErr);
                        imageUrls.push('https://via.placeholder.com/400x400/3498db/ffffff?text=' + encodeURIComponent(document.getElementById('productName').value.substring(0, 15)));
                    }
                } catch (err) {
                    console.error('Image processing error:', err);
                }
            }

            if (imageUrls.length > 0) {
                mainImage = imageUrls[0];
            }
        }

        const productData = {
            name: document.getElementById('productName').value.trim(),
            price: parseInt(document.getElementById('productPrice').value) || 0,
            image: mainImage,
            description: document.getElementById('productDescription').value.trim(),
            category: document.getElementById('productCategory').value,
            featured: document.getElementById('featuredProduct').checked,
            stock: parseInt(document.getElementById('productStock').value) || 0,
            condition: document.getElementById('productCondition').value,
            images: imageUrls,
            sellerId: currentUser.uid,
            sellerName: userData.name || currentUser.displayName || 'Seller',
            updatedAt: serverTimestamp()
        };

        if (editingProductId) {
            // UPDATE existing product
            await updateDoc(doc(db, 'products', editingProductId), productData);
            showNotification('Product updated successfully!', 'success');
        } else {
            // ADD new product
            productData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'products'), productData);
            showNotification('Product published successfully!', 'success');
        }

        setTimeout(() => window.location.href = 'seller-dashboard.html', 1500);

    } catch (error) {
        console.error('Upload error:', error);
        showNotification('Failed: ' + error.message, 'error');
        btn.textContent = originalText;
        btn.disabled = false;
    }
});
