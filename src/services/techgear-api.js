// ==========================================
// TechGear E-commerce API Service
// ==========================================
// Bu fayl CRM tizimidan TechGear saytini boshqarish uchun API service
// Backend API endpoint manzilini o'zgartiring

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-backend-api.com/api'; // .env faylidan o'qiydi

// API so'rovlarini yuborish uchun yordamchi funksiya
const apiRequest = async (endpoint, options = {}) => {
    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('crm_token')}`, // CRM token
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
};

// ==========================================
// MAHSULOTLAR (Products)
// ==========================================

export const productAPI = {
    // Barcha mahsulotlarni olish
    getAll: async () => {
        return await apiRequest('/products');
    },

    // Bitta mahsulotni ID bo'yicha olish
    getById: async (id) => {
        return await apiRequest(`/products/${id}`);
    },

    // Yangi mahsulot qo'shish
    create: async (productData) => {
        return await apiRequest('/products', {
            method: 'POST',
            body: JSON.stringify(productData),
        });
    },

    // Mahsulotni yangilash
    update: async (id, productData) => {
        return await apiRequest(`/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(productData),
        });
    },

    // Mahsulotni o'chirish
    delete: async (id) => {
        return await apiRequest(`/products/${id}`, {
            method: 'DELETE',
        });
    },

    // Mahsulot rasmini yuklash
    uploadImage: async (id, imageFile) => {
        const formData = new FormData();
        formData.append('image', imageFile);

        return await apiRequest(`/products/${id}/image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('crm_token')}`,
            },
            body: formData,
        });
    },
};

// ==========================================
// BUYURTMALAR (Orders)
// ==========================================

export const orderAPI = {
    // Barcha buyurtmalarni olish
    getAll: async (filters = {}) => {
        const queryParams = new URLSearchParams(filters).toString();
        return await apiRequest(`/orders?${queryParams}`);
    },

    // Bitta buyurtmani ID bo'yicha olish
    getById: async (id) => {
        return await apiRequest(`/orders/${id}`);
    },

    // Buyurtma statusini yangilash
    updateStatus: async (id, status) => {
        return await apiRequest(`/orders/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
    },

    // Buyurtmani o'chirish
    delete: async (id) => {
        return await apiRequest(`/orders/${id}`, {
            method: 'DELETE',
        });
    },

    // Buyurtma statistikasi
    getStats: async (dateRange = {}) => {
        const queryParams = new URLSearchParams(dateRange).toString();
        return await apiRequest(`/orders/stats?${queryParams}`);
    },
};

// ==========================================
// FOYDALANUVCHILAR (Users)
// ==========================================

export const userAPI = {
    // Barcha foydalanuvchilarni olish
    getAll: async (filters = {}) => {
        const queryParams = new URLSearchParams(filters).toString();
        return await apiRequest(`/users?${queryParams}`);
    },

    // Bitta foydalanuvchini ID bo'yicha olish
    getById: async (id) => {
        return await apiRequest(`/users/${id}`);
    },

    // Foydalanuvchi ma'lumotlarini yangilash
    update: async (id, userData) => {
        return await apiRequest(`/users/${id}`, {
            method: 'PUT',
            body: JSON.stringify(userData),
        });
    },

    // Foydalanuvchini o'chirish
    delete: async (id) => {
        return await apiRequest(`/users/${id}`, {
            method: 'DELETE',
        });
    },
};

// ==========================================
// KATEGORIYALAR (Categories)
// ==========================================

export const categoryAPI = {
    // Barcha kategoriyalarni olish
    getAll: async () => {
        return await apiRequest('/categories');
    },

    // Bitta kategoriyani ID bo'yicha olish
    getById: async (id) => {
        return await apiRequest(`/categories/${id}`);
    },

    // Yangi kategoriya qo'shish
    create: async (categoryData) => {
        return await apiRequest('/categories', {
            method: 'POST',
            body: JSON.stringify(categoryData),
        });
    },

    // Kategoriyani yangilash
    update: async (id, categoryData) => {
        return await apiRequest(`/categories/${id}`, {
            method: 'PUT',
            body: JSON.stringify(categoryData),
        });
    },

    // Kategoriyani o'chirish
    delete: async (id) => {
        return await apiRequest(`/categories/${id}`, {
            method: 'DELETE',
        });
    },
};

// ==========================================
// STATISTIKA (Analytics)
// ==========================================

export const analyticsAPI = {
    // Umumiy statistikani olish
    getDashboardStats: async () => {
        return await apiRequest('/analytics/dashboard');
    },

    // Savdo hisobotini olish
    getSalesReport: async (dateRange = {}) => {
        const queryParams = new URLSearchParams(dateRange).toString();
        return await apiRequest(`/analytics/sales?${queryParams}`);
    },

    // Foydalanuvchilar o'sish statistikasi
    getUserGrowth: async (period = 'month') => {
        return await apiRequest(`/analytics/users?period=${period}`);
    },
};
