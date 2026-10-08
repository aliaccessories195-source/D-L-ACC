/* D&L ACC - Storefront JavaScript
   Cleaned and hardened version.
*/

const SUPABASE_URL = "https://aurhnsykqlzmmuibcpft.supabase.co";
const SUPABASE_KEY = "sb_publishable_RVS6brwbOqspCPW2QcDRPg_i4V0e2Cy";
const MY_WHATSAPP_NUMBER = "201147013334";
const CART_STORAGE_KEY = "dl_acc_cart_v2";
const THEME_STORAGE_KEY = "theme";
const FAVORITES_STORAGE_KEY = "dl_acc_favorites_v1";
const RECENT_STORAGE_KEY = "dl_acc_recent_v1";
const FREE_SHIPPING_THRESHOLD = 1000;
const SHIPPING_FEE = 60;
function getShippingFee(subtotal) { return Number(subtotal) >= FREE_SHIPPING_THRESHOLD || Number(subtotal) <= 0 ? 0 : SHIPPING_FEE; }
let currentCategory = "الكل";
let recentIds = [];
let favorites = new Set();
const FALLBACK_IMAGE =
    "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=500&q=80";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let cart = [];
let allProducts = [];
let productRatings = {};
let activeCoupon = null;
let siteSettings = {};
const DEFAULT_WHATSAPP_ORDER_MESSAGE = `مرحباً D&L ACC 👋
أود تأكيد هذا الطلب:
{order_id}

{items}
{coupon}
💰 الإجمالي: {total} ج.م
👤 الاسم: {name}
📱 الموبايل: {phone}
📍 العنوان: {address}

تم حفظ الطلب في نظام المتجر ✅`;

function buildWhatsappOrderMessage(data = {}) {
    const values = {
        name: data.name || "",
        phone: data.phone || "",
        address: data.address || "",
        items: data.items || "",
        total: data.total ?? "0",
        order_id: data.order_id ? `رقم الطلب: #${data.order_id}` : "",
        coupon: data.coupon || ""
    };
    const template = String(siteSettings.whatsapp_order_message || DEFAULT_WHATSAPP_ORDER_MESSAGE).trim() || DEFAULT_WHATSAPP_ORDER_MESSAGE;
    return template.replace(/\{(name|phone|address|items|total|order_id|coupon)\}/g, (_, key) => values[key]);
}


/* -----------------------------
   Helpers
----------------------------- */

function normalizeCategory(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[أإآ]/g, "ا")
        .replace(/ة/g, "ه")
        .replace(/ى/g, "ي")
        .replace(/\s+/g, " ");
}


function getCategoryLabel(category) {
    const value = String(category || "").trim();
    if (normalizeCategory(value) === normalizeCategory("قلائد")) return "سلسله";
    return value;
}

function getProductCategories() {
    const seen = new Map();
    allProducts.forEach(product => {
        const raw = String(product?.category || "").trim();
        if (!raw) return;
        const key = normalizeCategory(raw);
        if (!seen.has(key)) seen.set(key, raw);
    });
    return [...seen.values()];
}

function renderCategoryNavigation() {
    const nav = document.getElementById("category-nav");
    const moods = document.getElementById("category-moods");
    const categories = getProductCategories();
    const palette = ["mood-gold", "mood-dark", "mood-ivory"];

    if (nav) {
        nav.innerHTML = "";
        const home = document.createElement("button");
        home.className = "filter-btn active";
        home.dataset.category = "الكل";
        home.textContent = "الرئيسية";
        home.addEventListener("click", () => filterCategory("الكل", home));
        nav.appendChild(home);

        categories.forEach(category => {
            const button = document.createElement("button");
            button.className = "filter-btn";
            button.dataset.category = category;
            button.textContent = getCategoryLabel(category);
            button.addEventListener("click", () => filterCategory(category, button));
            nav.appendChild(button);
        });
    }

    if (moods) {
        moods.innerHTML = "";
        categories.forEach((category, index) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = `mood-card ${palette[index % palette.length]}`;
            card.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><strong></strong><small>اختيارات من القسم الموجود عندك</small><i class="fas fa-arrow-left"></i>`;
            card.querySelector("strong").textContent = getCategoryLabel(category);
            card.addEventListener("click", () => filterCategory(category));
            moods.appendChild(card);
        });
    }
}

function categoryMatches(productCategory, selectedCategory) {
    const product = normalizeCategory(productCategory);
    const selected = normalizeCategory(selectedCategory);

    if (!product || !selected) return false;
    if (product === selected) return true;

    const aliases = {
        "قلائد": ["قلائد", "قلاده", "قلادات", "قلادة"],
        "انسيال": ["انسيال", "اساور", "اساور", "اسوره", "اسورة", "انسيالات"],
        "خواتم": ["خواتم", "خاتم", "خاتمات"]
    };

    const selectedAliases = aliases[selectedCategory] || [selectedCategory];
    const normalizedAliases = selectedAliases.map(normalizeCategory);

    return normalizedAliases.includes(product) ||
           normalizedAliases.some(alias =>
               product.includes(alias) || alias.includes(product)
           );
}

function safeImageUrl(value) {
    try {
        const url = new URL(String(value || ""), window.location.href);
        if (url.protocol === "http:" || url.protocol === "https:") {
            return url.href;
        }
    } catch (_) {}
    return FALLBACK_IMAGE;
}

function formatPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return "السعر غير متوفر";
    return `${number.toLocaleString("ar-EG")} ج.م`;
}

function getPricing(product) {
    const original = Math.max(0, Number(product?.price) || 0);
    const regularEnabled = Boolean(product?.discount_enabled) && Number(product?.discount_value) > 0;
    const regularType = product?.discount_type === "fixed" ? "fixed" : "percent";
    const regularValue = Math.max(0, Number(product?.discount_value) || 0);
    let sale = original;
    if (regularEnabled) sale = regularType === "percent" ? original * (1 - Math.min(regularValue, 100) / 100) : original - Math.min(regularValue, original);
    const now=Date.now();
    const offerActive=Boolean(product?.offer_enabled) && (!product?.offer_starts_at || new Date(product.offer_starts_at).getTime()<=now) && (!product?.offer_ends_at || new Date(product.offer_ends_at).getTime()>=now) && Number(product?.offer_value)>0;
    if(offerActive){ const ov=Math.max(0,Number(product.offer_value)||0); const offerSale=product.offer_type==='fixed'?original-Math.min(ov,original):original*(1-Math.min(ov,100)/100); sale=Math.min(sale,offerSale); }
    sale=Math.max(0,Math.round(sale*100)/100);
    return { original, sale, enabled: sale < original, type: regularEnabled ? regularType : (offerActive ? product.offer_type : "percent"), value: regularEnabled ? regularValue : (offerActive ? Number(product.offer_value) : 0), percent: original ? Math.round((1-sale/original)*100) : 0, offerActive };
}
function getSalePrice(product) { return getPricing(product).sale; }
function discountText(product) { const p=getPricing(product); return p.enabled ? (p.type === "percent" ? `خصم ${p.value}%` : `خصم ${formatPrice(p.value)}`) : ""; }

function loadCart() {
    try {
        const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return [];

        return saved
            .filter(item =>
                item &&
                item.id != null &&
                typeof item.name === "string" &&
                Number.isFinite(Number(item.price)) &&
                Number(item.quantity) > 0
            )
            .map(item => ({
                id: String(item.id),
                name: item.name,
                price: Number(item.price),
                image: typeof item.image === "string" ? item.image : "",
                quantity: Math.max(1, Math.floor(Number(item.quantity)))
            }));
    } catch (error) {
        console.warn("تعذر قراءة السلة المحفوظة:", error);
        return [];
    }
}

function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

/* -----------------------------
   Startup
----------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    loadTheme();
    cart = loadCart();
    loadFavorites();
    updateFavoritesCount();
    updateCartUI();
    fetchProducts();
    initLuxeInteractions();
    initShopControls();
    loadRecent();
    document.getElementById("checkout-form")?.addEventListener("submit", submitCheckout);
    document.getElementById("apply-coupon")?.addEventListener("click", applyCheckoutCoupon);
    document.getElementById("checkout-modal")?.addEventListener("click", (event) => { if (event.target.id === "checkout-modal") closeCheckout(); });
    const params = new URLSearchParams(location.search);
    if (params.get("checkout") === "1") {
        try { activeCoupon = JSON.parse(localStorage.getItem("dl_acc_active_coupon") || "null"); } catch (_) { activeCoupon = null; }
        localStorage.removeItem("dl_acc_active_coupon");
        setTimeout(() => openCheckout(), 250);
    }
});

/* -----------------------------
   Theme
----------------------------- */

function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "light";
    const icon = document.getElementById("theme-icon");

    if (savedTheme === "dark") {
        document.body.classList.remove("light-theme");
        document.body.classList.add("dark-theme");
        if (icon) icon.className = "fas fa-sun";
    } else {
        document.body.classList.remove("dark-theme");
        document.body.classList.add("light-theme");
        if (icon) icon.className = "fas fa-moon";
    }
}

function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById("theme-icon");
    const isDark = body.classList.contains("dark-theme");

    body.classList.toggle("dark-theme", !isDark);
    body.classList.toggle("light-theme", isDark);

    if (icon) {
        icon.className = !isDark ? "fas fa-sun" : "fas fa-moon";
    }

    localStorage.setItem(THEME_STORAGE_KEY, !isDark ? "dark" : "light");
}

/* -----------------------------
   Products
----------------------------- */

async function fetchProducts() {
    const container = document.getElementById("products-container");

    try {
        let result = await supabaseClient.from("products").select("id,title,product_code,price,category,image,stock,discount_enabled,discount_type,discount_value,offer_enabled,offer_name,offer_type,offer_value,offer_starts_at,offer_ends_at").order("id", { ascending: false });
        if (result.error) {
            console.warn("Discount columns are not active yet; loading legacy product fields.", result.error);
            result = await supabaseClient.from("products").select("id,title,product_code,price,category,image,stock").order("id", { ascending: false });
        }
        if (result.error) throw result.error;
        const data = result.data;
        allProducts = (Array.isArray(data) ? data : []).map(p => ({...p, stock:Number(p.stock||0), discount_enabled: Boolean(p.discount_enabled), discount_type: p.discount_type || "percent", discount_value: Number(p.discount_value || 0), offer_enabled:Boolean(p.offer_enabled), offer_type:p.offer_type||"percent", offer_value:Number(p.offer_value||0)}));

        // تحميل ملخص تقييمات العملاء مرة واحدة لعرضه على بطاقات المنتجات.
        productRatings = {};
        try {
            const reviewsResult = await supabaseClient.from("reviews").select("product_id,rating").eq("approved", true);
            if (!reviewsResult.error) {
                (reviewsResult.data || []).forEach(review => {
                    const id = String(review.product_id);
                    const rating = Math.max(1, Math.min(5, Number(review.rating) || 0));
                    if (!rating) return;
                    if (!productRatings[id]) productRatings[id] = { total: 0, count: 0 };
                    productRatings[id].total += rating;
                    productRatings[id].count += 1;
                });
                Object.keys(productRatings).forEach(id => {
                    const r = productRatings[id];
                    r.average = r.count ? Math.round((r.total / r.count) * 10) / 10 : 0;
                });
            }
        } catch (_) {}
        hydrateCartImages();
        renderCategoryNavigation();
        displayProducts(allProducts);
        renderFeaturedProducts();
        renderSocialShowcase();
        renderRecentProducts();
        renderRecommendations();
        applyProductView();
    } catch (error) {
        console.error("خطأ في جلب المنتجات:", error);

        if (container) {
            container.textContent = "";
            const message = document.createElement("p");
            message.style.cssText = "text-align:center;grid-column:1/-1;color:red;";
            message.textContent = "عذراً، فشل تحميل المنتجات. حاول تحديث الصفحة.";
            container.appendChild(message);
        }
    }
}

function createProductCard(product, index) {
    const card = document.createElement("div");
    card.className = "product-card";
    card.addEventListener("click", (event) => {
        if (!event.target.closest("button")) openQuickView(product);
    });

    const imageWrapper = document.createElement("div");
    imageWrapper.className = "product-image-wrapper";

    const tools = document.createElement("div");
    tools.className = "product-tools";

    const favoriteBtn = document.createElement("button");
    favoriteBtn.type = "button";
    favoriteBtn.className = `product-tool ${favorites.has(String(product.id)) ? "favorite-active" : ""}`;
    favoriteBtn.innerHTML = `<i class="${favorites.has(String(product.id)) ? "fas" : "far"} fa-heart"></i>`;
    favoriteBtn.title = "إضافة للمفضلة";
    favoriteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFavorite(product);
        const active = favorites.has(String(product.id));
        favoriteBtn.classList.toggle("favorite-active", active);
        favoriteBtn.innerHTML = `<i class="${active ? "fas" : "far"} fa-heart"></i>`;
    });

    const viewBtn = document.createElement("button");
    viewBtn.type = "button";
    viewBtn.className = "product-tool";
    viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
    viewBtn.title = "عرض سريع";
    viewBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openQuickView(product);
    });

    tools.append(favoriteBtn, viewBtn);
    imageWrapper.appendChild(tools);

    const img = document.createElement("img");
    img.className = "product-img";
    img.src = safeImageUrl(product.image);
    img.alt = product.title || "منتج";
    img.loading = "lazy";
    img.onerror = () => {
        img.onerror = null;
        img.src = FALLBACK_IMAGE;
    };

    imageWrapper.appendChild(img);

    const position = allProducts.findIndex(p => String(p.id) === String(product.id));
    if (position >= 0 && position < 4) {
        const badge = document.createElement("span");
        badge.className = "product-badge gold";
        badge.textContent = "جديد ✨";
        imageWrapper.appendChild(badge);
    } else if (Number(product.price) && Number(product.price) < 500) {
        const badge = document.createElement("span");
        badge.className = "product-badge";
        badge.textContent = "اختيار ذكي";
        imageWrapper.appendChild(badge);
    }

    const info = document.createElement("div");
    info.className = "product-info";

    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = product.category || "إكسسوارات";

    const title = document.createElement("h3");
    title.textContent = product.title || "منتج مميز";

    if (product.product_code) {
        const code = document.createElement("small");
        code.className = "product-code";
        code.textContent = `كود: ${product.product_code}`;
        info.appendChild(code);
    }
    if (Number.isFinite(Number(product.stock)) && Number(product.stock) <= 5) {
        const stockBadge=document.createElement("span"); stockBadge.className="store-discount-badge"; stockBadge.textContent=Number(product.stock)<=0?"نفدت الكمية":"متبقي كمية محدودة"; info.appendChild(stockBadge);
    }
    if (getPricing(product).offerActive) {
        const offerBadge=document.createElement("span"); offerBadge.className="store-discount-badge"; offerBadge.textContent=`⚡ ${product.offer_name||"عرض موسمي"}`; info.appendChild(offerBadge);
    }

    // تقييم العملاء يظهر مباشرة داخل بطاقة المنتج في صفحة "تسوقي الآن".
    const rating = document.createElement("div");
    rating.className = "product-rating-summary";
    const ratingData = productRatings[String(product.id)];
    if (ratingData?.count) {
        const avg = Number(ratingData.average || 0);
        const rounded = Math.round(avg);
        rating.innerHTML = `<span class="rating-stars">${"★".repeat(rounded)}${"☆".repeat(5-rounded)}</span><strong>${avg.toFixed(1)}</strong><small>(${ratingData.count} تقييم)</small>`;
        rating.title = `متوسط تقييم العملاء: ${avg.toFixed(1)} من 5`;
    } else {
        rating.innerHTML = `<span class="rating-stars empty">☆☆☆☆☆</span><small>لا توجد تقييمات بعد</small>`;
    }

    const footer = document.createElement("div");
    footer.className = "product-footer";

    const price = document.createElement("span");
    price.className = "price";
    const pricing = getPricing(product);
    if (pricing.enabled) {
        price.innerHTML = `<span class="discount-old">${formatPrice(pricing.original)}</span><span class="discount-new">${formatPrice(pricing.sale)}</span>`;
        const discountBadge=document.createElement("span"); discountBadge.className="store-discount-badge"; discountBadge.textContent=`🔥 ${discountText(product)}`;
        info.appendChild(discountBadge);
    } else { price.textContent = formatPrice(pricing.original); }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "add-to-cart-btn";
    button.innerHTML = '<i class="fas fa-shopping-bag"></i> إضافة للسلة';
    button.addEventListener("click", () => addToCart(product));

    const reviewBtn = document.createElement("button");
    reviewBtn.type = "button";
    reviewBtn.className = "card-review-btn";
    reviewBtn.innerHTML = '<i class="fas fa-star"></i> قيّمي المنتج';
    reviewBtn.addEventListener("click", (event) => { event.stopPropagation(); openQuickView(product, true); });

    footer.append(price, button);
    info.append(category, title, rating, reviewBtn, footer);
    card.append(imageWrapper, info);

    return card;
}

function displayProducts(products) {
    const container = document.getElementById("products-container");
    if (!container) return;
    container.textContent = "";
    if (!Array.isArray(products) || products.length === 0) {
        const message = document.createElement("p");
        message.className = "section-empty";
        message.textContent = "مش لاقيين قطعة بالمواصفات دي حالياً 🤍";
        container.appendChild(message);
        updateResultsMeta(0);
        return;
    }
    products.forEach((product, index) => container.appendChild(createProductCard(product, index)));
    updateResultsMeta(products.length);
}

function updateResultsMeta(count) {
    const el = document.getElementById("results-meta");
    if (el) el.textContent = `${count.toLocaleString("ar-EG")} قطعة متاحة • اختاري المفضلة عندك واحفظيها لوقت لاحق`;
}

function getVisibleProducts() {
    let list = [...allProducts];
    const search = String(document.getElementById("product-search")?.value || "").trim().toLowerCase();
    const priceFilter = document.getElementById("price-filter")?.value || "all";
    const sort = document.getElementById("sort-products")?.value || "newest";

    if (currentCategory !== "الكل") list = list.filter(p => categoryMatches(p.category, currentCategory));
    if (search) list = list.filter(p => `${p.title || ""} ${p.product_code || ""} ${p.category || ""}`.toLowerCase().includes(search));
    if (priceFilter !== "all") {
        list = list.filter(p => {
            const price = getSalePrice(p);
            if (!Number.isFinite(price)) return false;
            if (priceFilter === "under500") return price < 500;
            if (priceFilter === "500to1000") return price >= 500 && price <= 1000;
            return price > 1000;
        });
    }
    list.sort((a,b) => {
        if (sort === "price-low") return getSalePrice(a) - getSalePrice(b);
        if (sort === "price-high") return getSalePrice(b) - getSalePrice(a);
        if (sort === "name") return String(a.title || "").localeCompare(String(b.title || ""), "ar");
        return Number(b.id || 0) - Number(a.id || 0);
    });
    return list;
}

function applyProductView() { displayProducts(getVisibleProducts()); }

function initShopControls() {
    const search = document.getElementById("product-search");
    const clear = document.getElementById("clear-search");
    const price = document.getElementById("price-filter");
    const sort = document.getElementById("sort-products");
    search?.addEventListener("input", applyProductView);
    clear?.addEventListener("click", () => { if (search) search.value = ""; applyProductView(); search?.focus(); });
    price?.addEventListener("change", applyProductView);
    sort?.addEventListener("change", applyProductView);
}

/* -----------------------------
   Category filtering
----------------------------- */

function filterCategory(categoryName, button) {
    currentCategory = categoryName;
    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.remove("active");
    });

    if (button) {
        button.classList.add("active");
    } else {
        const matchingButton = [...document.querySelectorAll(".filter-btn")]
            .find(btn => btn.dataset.category === categoryName);
        if (matchingButton) matchingButton.classList.add("active");
    }

    const titleElement = document.getElementById("current-category-title");

    if (categoryName === "الكل") {
        if (titleElement) titleElement.textContent = "الأكثر مبيعاً في D&L ACC";
        applyProductView();
        return;
    }

    if (titleElement) titleElement.textContent = `قسم ${getCategoryLabel(categoryName)}`;
    applyProductView();
}

/* -----------------------------
   Cart
----------------------------- */

function addToCart(product) {
    const currentQty = cart.find(x=>String(x.id)===String(product.id))?.quantity || 0;
    const stock = Number(product?.stock);
    if (Number.isFinite(stock) && stock <= 0) { showToast("القطعة خلصت من المخزون حاليًا 🤍"); return; }
    if (Number.isFinite(stock) && currentQty >= stock) { showToast(`المتاح من القطعة ${stock} فقط.`); return; }
    if (!product || product.id == null) return;

    const price = getSalePrice(product);
    if (!Number.isFinite(price) || price < 0) {
        alert("هذا المنتج لا يحتوي على سعر صالح حالياً.");
        return;
    }

    const productId = String(product.id);
    const existingItem = cart.find(item => item.id === productId);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: productId,
            name: String(product.title || "منتج"),
            price,
            image: safeImageUrl(product.image),
            quantity: 1
        });
    }

    saveCart();
    updateCartUI();
    showToast(`تمت إضافة «${product.title || "القطعة"}» إلى الحقيبة ✨`);

    const cartBtn = document.getElementById("cart-btn");
    if (cartBtn) {
        cartBtn.classList.add("pulse-effect");
        setTimeout(() => cartBtn.classList.remove("pulse-effect"), 400);
    }
}

function updateCartUI() {
    const cartItemsContainer = document.getElementById("cart-items");
    const cartCountElement = document.getElementById("cart-count");
    const totalPriceElement = document.getElementById("total-price");

    if (!cartItemsContainer || !cartCountElement || !totalPriceElement) return;

    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCountElement.textContent = totalItems.toLocaleString("ar-EG");

    cartItemsContainer.textContent = "";

    if (cart.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-cart-msg";

        const icon = document.createElement("i");
        icon.className = "fas fa-shopping-bag";
        icon.style.cssText = "font-size:40px;margin-bottom:15px;opacity:.3;";

        const text = document.createElement("p");
        text.textContent = "حقيبتكِ فارغة حالياً.. ابدئي بالتسوق الآن!";

        empty.append(icon, text);
        cartItemsContainer.appendChild(empty);
        totalPriceElement.textContent = "0 ج.م";
        updateShippingProgress(0);
        return;
    }

    let totalCost = 0;

    cart.forEach((item, index) => {
        totalCost += item.price * item.quantity;

        const row = document.createElement("div");
        row.className = "cart-item";

        const thumb = document.createElement("img");
        thumb.className = "cart-item-img";
        thumb.alt = item.name || "منتج";
        thumb.loading = "lazy";
        thumb.src = item.image || FALLBACK_IMAGE;
        thumb.onerror = () => { thumb.onerror = null; thumb.src = FALLBACK_IMAGE; };

        const info = document.createElement("div");
        info.className = "item-info";

        const name = document.createElement("h4");
        name.textContent = item.name;

        const itemPrice = document.createElement("span");
        itemPrice.className = "item-price";
        itemPrice.textContent =
            `${item.price.toLocaleString("ar-EG")} ج.م × ${item.quantity.toLocaleString("ar-EG")}`;

        info.append(name, itemPrice);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-item-btn";
        remove.innerHTML = '<i class="fas fa-trash-alt"></i> إزالة';
        remove.addEventListener("click", () => removeFromCart(index));

        row.append(thumb, info, remove);
        cartItemsContainer.appendChild(row);
    });

    totalPriceElement.textContent = `${totalCost.toLocaleString("ar-EG")} ج.م`;
    updateShippingProgress(totalCost);
}

function updateShippingProgress(total) {
    const bar = document.getElementById("shipping-progress-bar");
    const remaining = document.getElementById("shipping-remaining");
    const message = document.getElementById("shipping-message");
    const percent = Math.min(100, (Number(total) / FREE_SHIPPING_THRESHOLD) * 100);
    if (bar) bar.style.width = `${percent}%`;
    if (remaining) remaining.textContent = total >= FREE_SHIPPING_THRESHOLD ? "تم الشحن المجاني 🎁" : `باقي ${formatPrice(FREE_SHIPPING_THRESHOLD - total)}`;
    if (message) message.textContent = total >= FREE_SHIPPING_THRESHOLD ? "مبروك! طلبك مؤهل للشحن المجاني" : "شحن مجاني للطلبات فوق 1000 ج.م";
}


function removeFromCart(index) {
    if (!Number.isInteger(index) || index < 0 || index >= cart.length) return;

    cart.splice(index, 1);
    saveCart();
    updateCartUI();
}

function toggleCart() {
    const sidebar = document.getElementById("cart-sidebar");
    const overlay = document.getElementById("cart-overlay");

    if (!sidebar || !overlay) return;

    sidebar.classList.toggle("open");
    overlay.classList.toggle("active");
}


function getCartTotal() {
    return cart.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
}

function renderCheckoutSummary() {
    const root = document.getElementById("checkout-summary");
    if (!root) return;
    root.textContent = "";
    cart.forEach(item => {
        const row = document.createElement("div");
        row.className = "checkout-summary-row";
        const name = document.createElement("span");
        name.textContent = `${item.name} × ${item.quantity}`;
        const price = document.createElement("strong");
        price.textContent = formatPrice(item.price * item.quantity);
        row.append(name, price);
        root.appendChild(row);
    });
    const subtotal=getCartTotal();
    if(activeCoupon){ const discountRow=document.createElement("div");discountRow.className="checkout-summary-row";discountRow.innerHTML='<span>خصم الكوبون</span><strong></strong>';discountRow.querySelector("strong").textContent=`- ${formatPrice(activeCoupon.discount)}`;root.appendChild(discountRow);}
    const shipFee = getShippingFee(subtotal);
    const shipRow = document.createElement("div");
    shipRow.className = "checkout-summary-row";
    shipRow.innerHTML = "<span>الشحن</span><strong></strong>";
    shipRow.querySelector("strong").textContent = shipFee ? formatPrice(shipFee) : "مجاني 🎁";
    root.appendChild(shipRow);
    const total = document.createElement("div");
    total.className = "checkout-summary-total";
    const label = document.createElement("span");
    label.textContent = "الإجمالي النهائي";
    const value = document.createElement("span");
    value.textContent = formatPrice(Math.max(0,subtotal-(activeCoupon?.discount||0)+shipFee));
    total.append(label, value);
    root.appendChild(total);
}

function openCheckout() {
    if (!cart.length) {
        showToast("السلة فاضية — اختاري قطعة الأول 🤍");
        return;
    }
    const modal = document.getElementById("checkout-modal");
    if (!modal) return;
    renderCheckoutSummary();
    const saved = (() => { try { return JSON.parse(localStorage.getItem("dl_acc_checkout_v1") || "{}"); } catch (_) { return {}; } })();
    const name = document.getElementById("checkout-name");
    const phone = document.getElementById("checkout-phone");
    const address = document.getElementById("checkout-address");
    if (name && saved.name) name.value = saved.name;
    if (phone && saved.phone) phone.value = saved.phone;
    if (address && saved.address) address.value = saved.address;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => name?.focus(), 80);
}

function closeCheckout() {
    const modal = document.getElementById("checkout-modal");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

async function applyCheckoutCoupon(){
    const input=document.getElementById("checkout-coupon"), msg=document.getElementById("coupon-message"); if(!input)return;
    const code=input.value.trim().toUpperCase();
    if(!code){activeCoupon=null;if(msg){msg.textContent="";msg.classList.remove("show");}renderCheckoutSummary();return;}
    const total=getCartTotal();
    try{
        // Prefer the existing secure RPC. If it is unavailable, fall back to a direct
        // read from the coupons table so the storefront can still work without
        // requiring a new SQL function.
        let row=null;
        const rpc=await supabaseClient.rpc("validate_coupon",{p_code:code,p_order_total:total});
        if(!rpc.error){
            row=Array.isArray(rpc.data)?rpc.data[0]:rpc.data;
        }else{
            const q=await supabaseClient.from("coupons").select("code,discount_percent,min_order,usage_limit,used_count,expires_at,active").eq("code",code).maybeSingle();
            if(q.error) throw rpc.error;
            const c=q.data;
            const expired=c?.expires_at && new Date(c.expires_at).getTime()<Date.now();
            const exhausted=Number(c?.usage_limit||0)>0 && Number(c?.used_count||0)>=Number(c.usage_limit);
            if(!c || c.active===false || expired || exhausted || total<Number(c.min_order||0)) throw new Error("الكود غير صالح أو غير متاح لهذا الطلب");
            row={code:c.code,discount:Math.max(0,total*(Number(c.discount_percent||0)/100))};
        }
        if(!row)throw new Error("الكود غير صالح");
        activeCoupon={code:row.code,discount:Number(row.discount||0)};
        if(msg){msg.textContent=`تم تطبيق ${row.code} — خصم ${formatPrice(row.discount)}`;msg.classList.add("show");}
        renderCheckoutSummary();
    }catch(e){
        activeCoupon=null;
        if(msg){msg.textContent=e.message||"كود الخصم غير صالح";msg.classList.add("show");}
        renderCheckoutSummary();
    }
}

async function submitCheckout(event) {
    event.preventDefault();
    if (!cart.length) return;
    const name = document.getElementById("checkout-name")?.value.trim();
    const phone = document.getElementById("checkout-phone")?.value.trim();
    const address = document.getElementById("checkout-address")?.value.trim();
    const status = document.getElementById("checkout-status");
    if (!name || !phone || !address) {
        if (status) { status.textContent = "من فضلك كمّلي الاسم ورقم الموبايل والعنوان."; status.classList.add("show"); }
        return;
    }
    const normalizedPhone = phone.replace(/[^0-9+]/g, "");
    if (normalizedPhone.length < 10) {
        if (status) { status.textContent = "رقم الموبايل مش واضح، اكتبيه بشكل صحيح."; status.classList.add("show"); }
        return;
    }
    localStorage.setItem("dl_acc_checkout_v1", JSON.stringify({name, phone, address}));
    const subtotal = getCartTotal();
    const couponDiscount = Number(activeCoupon?.discount || 0);
    const shippingFee = getShippingFee(subtotal);
    const total = Math.max(0, subtotal - couponDiscount + shippingFee);
    const orderItems = cart.map(item => ({id: item.id, name: item.name, price: item.price, quantity: item.quantity}));
    const submitBtn = event.submitter || document.querySelector(".checkout-submit");
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري تجهيز الطلب...'; }

    let savedOrder = false;
    let savedOrderId = null;
    if(activeCoupon){
        try{
            const rpc=await supabaseClient.rpc("redeem_coupon",{p_code:activeCoupon.code,p_order_total:subtotal});
            if(!rpc.error){
                const redeemed=Array.isArray(rpc.data)?rpc.data[0]:rpc.data;
                if(redeemed){ activeCoupon.discount=Number(redeemed.discount||activeCoupon.discount||0); }
            }else{
                // Fallback for projects that already have the coupons table but
                // do not have the optional redeem_coupon RPC.
                const q=await supabaseClient.from("coupons").select("id,code,discount_percent,min_order,usage_limit,used_count,expires_at,active").eq("code",activeCoupon.code).maybeSingle();
                if(q.error) throw rpc.error;
                const c=q.data;
                const expired=c?.expires_at && new Date(c.expires_at).getTime()<Date.now();
                const exhausted=Number(c?.usage_limit||0)>0 && Number(c?.used_count||0)>=Number(c.usage_limit);
                if(!c || c.active===false || expired || exhausted || subtotal<Number(c.min_order||0)) throw new Error("الكوبون غير متاح لهذا الطلب");
                const discount=Math.max(0,subtotal*(Number(c.discount_percent||0)/100));
                const upd=await supabaseClient.from("coupons").update({used_count:Number(c.used_count||0)+1}).eq("id",c.id);
                if(upd.error) throw upd.error;
                activeCoupon.discount=discount;
            }
        }catch(e){
            if(status){status.textContent=e.message||"تعذر تطبيق الكوبون وقت التأكيد";status.classList.add("show");}
            if(submitBtn){submitBtn.disabled=false;submitBtn.innerHTML='<i class="fab fa-whatsapp"></i> تأكيد الطلب وفتح واتساب';}
            return;
        }
    }
    try {
        const { data, error } = await supabaseClient.from("orders").insert({
            customer_name: name,
            phone,
            address,
            items: orderItems,
            total,
            status: "new",
            coupon_code: activeCoupon?.code || null,
            coupon_discount: couponDiscount
        }).select("id").single();
        if (!error) {
            savedOrder = true;
            savedOrderId = data?.id || null;
        } else console.warn("Order table is not enabled or insert was blocked:", error.message);
    } catch (error) {
        console.warn("Order save skipped:", error);
    }

    const itemsText = orderItems.map((item, index) =>
        `${index + 1}. ${item.name}\nالكمية: ${item.quantity} | الإجمالي: ${item.price * item.quantity} ج.م`
    ).join("\n");
    const shippingText = shippingFee ? `🚚 الشحن: ${shippingFee} ج.م` : "🚚 الشحن: مجاني";
    const couponText = couponDiscount ? `🎟️ الكوبون: ${activeCoupon.code} (-${couponDiscount} ج.م)` : "";
    const message = buildWhatsappOrderMessage({
        name, phone, address, total,
        items: itemsText,
        order_id: savedOrderId,
        coupon: [couponText, shippingText].filter(Boolean).join("\n")
    });

    const whatsappURL = `https://api.whatsapp.com/send?phone=${MY_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;
    window.open(whatsappURL, "_blank", "noopener,noreferrer");
    const reviewItems = orderItems.map(i => ({ ...i }));
    cart = [];
    activeCoupon = null;
    const couponInput=document.getElementById("checkout-coupon"); if(couponInput) couponInput.value="";
    saveCart();
    updateCartUI();
    closeCheckout();
    toggleCart();
    showToast(savedOrder ? "تم تسجيل الطلب وفتح واتساب ✅" : "تم تجهيز الطلب وفتح واتساب ✅");
    setTimeout(() => openPostOrderReview(reviewItems, name, savedOrderId), 600);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fab fa-whatsapp"></i> تأكيد الطلب وفتح واتساب'; }
}

function checkoutToWhatsapp() {
    if (cart.length === 0) {
        alert("سلتكِ فارغة! يرجى إضافة قطع أنيقة أولاً لطلبها 🤍.");
        return;
    }

    let totalCost = 0;
    const itemsText = cart.map((item, index) => {
        const itemTotal = item.price * item.quantity;
        totalCost += itemTotal;
        return `${index + 1}. ${item.name}\nالكمية: ${item.quantity} | السعر: ${itemTotal} ج.م`;
    }).join("\n\n");

    const message = buildWhatsappOrderMessage({
        total: totalCost,
        items: itemsText,
        coupon: ""
    });

    const whatsappURL =
        `https://api.whatsapp.com/send?phone=${MY_WHATSAPP_NUMBER}&text=${encodeURIComponent(message)}`;

    window.open(whatsappURL, "_blank", "noopener,noreferrer");
}
/* أضف هذا الكود في نهاية ملف script.js */
supabaseClient
  .channel('public:products')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'products' }, payload => {
    console.log('تم تحديث منتج، جاري إعادة جلب المنتجات...', payload);
    fetchProducts(); // إعادة جلب المنتجات وتحديث العرض تلقائياً
  })
  .subscribe();

/* -----------------------------
   V5 discovery features
----------------------------- */
function loadRecent() {
    try { recentIds = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || "[]").map(String); } catch (_) { recentIds = []; }
}
function saveRecent() { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentIds.slice(0, 8))); }
function rememberRecent(product) {
    const id = String(product.id);
    recentIds = [id, ...recentIds.filter(x => x !== id)].slice(0, 8);
    saveRecent();
    renderRecentProducts();
    renderRecommendations();
}
function miniCard(product, label) {
    const card = document.createElement("article");
    card.className = "mini-product-card";
    card.innerHTML = `<div class="mini-product-image"><img loading="lazy" alt=""><span class="product-badge gold">${label}</span></div><div class="mini-product-body"><small></small><h3></h3><strong></strong></div>`;
    const img = card.querySelector("img"); img.src = safeImageUrl(product.image); img.alt = product.title || "منتج"; img.onerror = () => { img.onerror=null; img.src=FALLBACK_IMAGE; };
    card.querySelector("small").textContent = getCategoryLabel(product.category || "إكسسوارات");
    card.querySelector("h3").textContent = product.title || "قطعة مميزة";
    card.querySelector("strong").textContent = formatPrice(getSalePrice(product));
    card.addEventListener("click", () => openProductDetails(product));
    return card;
}
function renderRecentProducts() {
    const root = document.getElementById("recent-products"); if (!root) return; root.textContent = "";
    const list = recentIds.map(id => allProducts.find(p => String(p.id) === id)).filter(Boolean);
    document.getElementById("recent-section")?.classList.toggle("hidden", list.length === 0);
    list.slice(0,4).forEach(p => root.appendChild(miniCard(p, "شوفتيها قبل كده")));
}
function renderRecommendations() {
    const root = document.getElementById("recommendation-products"); if (!root) return; root.textContent = "";
    const recentCats = recentIds.map(id => allProducts.find(p => String(p.id) === id)?.category).filter(Boolean).map(normalizeCategory);
    let list = allProducts.filter(p => !recentIds.includes(String(p.id)));
    if (recentCats.length) { const same = list.filter(p => recentCats.includes(normalizeCategory(p.category))); if (same.length) list = same.concat(list.filter(p => !same.includes(p))); }
    list.slice(0,4).forEach(p => root.appendChild(miniCard(p, "ممكن يعجبك")));
}

/* -----------------------------
   Luxe interactions
----------------------------- */
function loadFavorites() {
    try {
        const saved = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
        favorites = new Set(Array.isArray(saved) ? saved.map(String) : []);
    } catch (_) { favorites = new Set(); }
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify([...favorites]));
    updateFavoritesCount();
}

function updateFavoritesCount() {
    const count = document.getElementById("favorites-count");
    if (count) count.textContent = favorites.size.toLocaleString("ar-EG");
}

function toggleFavorite(product) {
    const id = String(product.id);
    if (favorites.has(id)) {
        favorites.delete(id);
        showToast("تمت إزالة القطعة من المفضلة");
    } else {
        favorites.add(id);
        showToast("اتحفظت في المفضلة 🤍");
    }
    saveFavorites();
}

function openQuickView(product, scrollToReview = false) {
    rememberRecent(product);
    const modal = document.getElementById("quick-view");
    const content = document.getElementById("quick-view-content");
    if (!modal || !content || !product) return;

    const image = safeImageUrl(product.image);
    const pricing = getPricing(product);
    const price = pricing.enabled ? `${formatPrice(pricing.sale)} — ${pricing.percent}% خصم` : formatPrice(pricing.original);

    content.textContent = "";
    const grid = document.createElement("div");
    grid.className = "quick-view-grid";

    const media = document.createElement("div");
    media.className = "quick-view-media";
    const img = document.createElement("img");
    img.src = image;
    img.alt = product.title || "منتج";
    media.appendChild(img);

    const info = document.createElement("div");
    info.className = "quick-view-info";
    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = product.category || "إكسسوارات";
    const title = document.createElement("h2");
    title.textContent = product.title || "قطعة مميزة";
    const priceEl = document.createElement("div");
    priceEl.className = "quick-view-price";
    priceEl.textContent = price;
    const desc = document.createElement("p");
    desc.textContent = "قطعة مختارة بعناية من D&L ACC — اضغطي لإضافتها إلى حقيبتك وإكمال طلبك عبر الواتساب.";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "quick-view-add";
    add.innerHTML = '<i class="fas fa-shopping-bag"></i> إضافة إلى الحقيبة';
    add.addEventListener("click", () => { addToCart(product); closeQuickView(); });

    info.append(category, title, priceEl, desc, add);
    grid.append(media, info);
    content.appendChild(grid);
    const qvReviews = document.createElement("div");
    qvReviews.className = "v11-review-loading";
    qvReviews.textContent = "جاري تحميل التقييمات...";
    content.appendChild(qvReviews);
    loadReviewsForProduct(product.id).then(rows => {
        qvReviews.textContent = "";
        renderProductReviews(qvReviews, rows, product.id);
        if (scrollToReview) setTimeout(() => qvReviews.scrollIntoView({ behavior: "auto", block: "start" }), 120);
    });
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeQuickView() {
    const modal = document.getElementById("quick-view");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

let toastTimer;
function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function initLuxeInteractions() {
    const modal = document.getElementById("quick-view");
    modal?.addEventListener("click", (event) => {
        if (event.target === modal) closeQuickView();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { closeQuickView(); closeProductDetails(); closeCheckout(); }
    });

    const backTop = document.getElementById("back-to-top");
    window.addEventListener("scroll", () => {
        backTop?.classList.toggle("show", window.scrollY > 550);
    }, { passive: true });

}


/* -----------------------------
   V3 Editorial / Product details
----------------------------- */
function getProductImage(product) {
    return safeImageUrl(product?.image);
}

function renderFeaturedProducts() {
    const container = document.getElementById("featured-products");
    if (!container) return;
    container.textContent = "";
    const picks = allProducts.slice(0, 4);
    if (!picks.length) {
        container.innerHTML = '<p class="section-empty">جاري تجهيز الاختيارات...</p>';
        return;
    }
    picks.forEach((product, index) => {
        const card = document.createElement("article");
        card.className = "mini-product-card";
        const imgWrap = document.createElement("div");
        imgWrap.className = "mini-product-image";
        const img = document.createElement("img");
        img.src = getProductImage(product);
        img.alt = product.title || "منتج";
        img.loading = "lazy";
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMAGE; };
        imgWrap.appendChild(img);
        const body = document.createElement("div");
        body.className = "mini-product-body";
        const cat = document.createElement("small");
        cat.textContent = product.category || "إكسسوارات";
        const title = document.createElement("h3");
        title.textContent = product.title || "قطعة مميزة";
        const price = document.createElement("strong");
        const pricing = getPricing(product);
    if (pricing.enabled) { price.innerHTML = `<span class="discount-old">${formatPrice(pricing.original)}</span> <span class="discount-new">${formatPrice(pricing.sale)}</span> <small>🔥 ${discountText(product)}</small>`; } else { price.textContent = formatPrice(pricing.original); }
        body.append(cat, title, price);
        card.append(imgWrap, body);
        card.addEventListener("click", () => openProductDetails(product));
        container.appendChild(card);
    });
}

function renderSocialShowcase() {
    const grid = document.getElementById("social-grid");
    if (!grid) return;
    grid.textContent = "";
    const items = allProducts.slice(0, 6);
    items.forEach((product, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `social-tile social-tile-${index + 1}`;
        item.setAttribute("aria-label", `عرض ${product.title || "القطعة"}`);
        const img = document.createElement("img");
        img.src = getProductImage(product);
        img.alt = product.title || "D&L ACC";
        img.loading = "lazy";
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMAGE; };
        const overlay = document.createElement("span");
        overlay.innerHTML = '<i class="fas fa-heart"></i> <b>D&L</b>';
        item.append(img, overlay);
        item.addEventListener("click", () => openProductDetails(product));
        grid.appendChild(item);
    });
}

function openProductDetails(product) {
    rememberRecent(product);
    const modal = document.getElementById("product-details");
    const content = document.getElementById("product-details-content");
    if (!modal || !content || !product) return;

    content.textContent = "";
    const layout = document.createElement("div");
    layout.className = "details-grid";

    const media = document.createElement("div");
    media.className = "details-media";
    const img = document.createElement("img");
    img.src = getProductImage(product);
    img.alt = product.title || "منتج";
    media.appendChild(img);
    const shimmer = document.createElement("span");
    shimmer.className = "details-shimmer";
    media.appendChild(shimmer);

    const info = document.createElement("div");
    info.className = "details-info";
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = product.category || "D&L ACC";
    const title = document.createElement("h2");
    title.textContent = product.title || "قطعة مميزة";
    const price = document.createElement("div");
    price.className = "details-price";
    price.textContent = formatPrice(getSalePrice(product));

    // ملخص تقييم العملاء يظهر داخل نافذة تفاصيل المنتج نفسها، وليس أسفلها فقط.
    const ratingSummary = document.createElement("div");
    ratingSummary.className = "details-rating-summary";
    const ratingData = productRatings[String(product.id)];
    if (ratingData?.count) {
        const avg = Number(ratingData.average || 0);
        const rounded = Math.max(0, Math.min(5, Math.round(avg)));
        ratingSummary.innerHTML = `<span class="details-rating-stars">${"★".repeat(rounded)}${"☆".repeat(5-rounded)}</span><strong>${avg.toFixed(1)}</strong><span class="details-rating-count">(${ratingData.count} تقييم من العملاء)</span>`;
    } else {
        ratingSummary.innerHTML = '<span class="details-rating-stars empty">☆☆☆☆☆</span><span class="details-rating-count">لا توجد تقييمات منشورة لهذا المنتج حتى الآن</span>';
    }

    const divider = document.createElement("div");
    divider.className = "details-divider";
    const note = document.createElement("p");
    note.textContent = "قطعة من تشكيلة D&L ACC. التفاصيل المعروضة هنا مبنية على بيانات المنتج الحالية، بدون تعديل قاعدة البيانات.";

    const meta = document.createElement("div");
    meta.className = "details-meta";
    [["01", "اختيار راقٍ"], ["02", "تغليف أنيق"], ["03", "طلب عبر واتساب"]].forEach(([num, label]) => {
        const item = document.createElement("div");
        item.innerHTML = `<b>${num}</b><span>${label}</span>`;
        meta.appendChild(item);
    });

    const actions = document.createElement("div");
    actions.className = "details-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "quick-view-add";
    add.innerHTML = '<i class="fas fa-shopping-bag"></i> أضيفي للحقيبة';
    add.addEventListener("click", () => { addToCart(product); closeProductDetails(); });
    const fav = document.createElement("button");
    fav.type = "button";
    fav.className = "details-fav";
    const active = favorites.has(String(product.id));
    fav.innerHTML = `<i class="${active ? "fas" : "far"} fa-heart"></i> ${active ? "في المفضلة" : "أضيفي للمفضلة"}`;
    fav.addEventListener("click", () => {
        toggleFavorite(product);
        const nowActive = favorites.has(String(product.id));
        fav.innerHTML = `<i class="${nowActive ? "fas" : "far"} fa-heart"></i> ${nowActive ? "في المفضلة" : "أضيفي للمفضلة"}`;
    });
    actions.append(add, fav);

    info.append(eyebrow, title, price, ratingSummary, divider, note, meta, actions);
    layout.append(media, info);
    content.appendChild(layout);
    const reviewsBox=document.createElement("div"); reviewsBox.className="v11-review-loading"; reviewsBox.textContent="جاري تحميل التقييمات..."; content.appendChild(reviewsBox); loadReviewsForProduct(product.id).then(rows=>{reviewsBox.textContent="";renderProductReviews(reviewsBox,rows,product.id);});
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeProductDetails() {
    const modal = document.getElementById("product-details");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

const originalFilterCategory = filterCategory;
filterCategory = function(categoryName, button) {
    originalFilterCategory(categoryName, button);
    if (categoryName !== "الكل") {
        document.getElementById("products")?.scrollIntoView({ behavior: "auto", block: "start" });
    }
};

const oldInitLuxeInteractions = initLuxeInteractions;
initLuxeInteractions = function() {
    oldInitLuxeInteractions();
    const modal = document.getElementById("product-details");
    modal?.addEventListener("click", (event) => {
        if (event.target === modal) closeProductDetails();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeProductDetails();
    });
};


// V6 — Developer profile card
function openDeveloperCard() {
    const modal = document.getElementById("developer-card");
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeDeveloperCard() {
    const modal = document.getElementById("developer-card");
    if (!modal) return;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

document.addEventListener("DOMContentLoaded", () => {
    const modal = document.getElementById("developer-card");
    modal?.addEventListener("click", (event) => {
        if (event.target === modal) closeDeveloperCard();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeDeveloperCard();
    });
});
async function loadSiteSettings(){try{const {data}=await supabaseClient.from("site_settings").select("key,value");siteSettings=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));const bar=document.querySelector(".announcement-bar span");if(bar&&siteSettings.announcement)bar.textContent=siteSettings.announcement;const threshold=Number(siteSettings.free_shipping_threshold||1000);siteSettings.whatsapp_order_message=siteSettings.whatsapp_order_message||DEFAULT_WHATSAPP_ORDER_MESSAGE;document.querySelectorAll(".announcement-bar a").forEach(a=>{a.href=siteSettings.whatsapp?`https://wa.me/${siteSettings.whatsapp}`:a.href});document.querySelectorAll(".floating-whatsapp").forEach(a=>{if(siteSettings.whatsapp)a.href=`https://wa.me/${siteSettings.whatsapp}`});}catch(e){console.warn("settings",e)}}
async function loadReviewsForProduct(productId){try{const {data,error}=await supabaseClient.from("reviews").select("customer_name,rating,comment,created_at").eq("product_id",productId).eq("approved",true).order("created_at",{ascending:false});if(error)throw error;return data||[]}catch(e){return []}}
function renderProductReviews(container,reviews,productId){
  const box=document.createElement("div");
  box.className="v11-reviews";
  const h=document.createElement("h3");
  h.textContent="تقييمات العملاء ⭐";
  box.appendChild(h);

  if(!reviews.length){
    const p=document.createElement("p");
    p.className="muted-v11";
    p.textContent="لسه مفيش تقييمات منشورة. كوني أول واحدة تقيّم القطعة.";
    box.appendChild(p);
  }else{
    reviews.slice(0,6).forEach(r=>{
      const row=document.createElement("div");
      row.className="v11-review-card";
      const rating=Math.max(1,Math.min(5,Number(r.rating)||0));
      row.innerHTML=`<b>${r.customer_name||"عميل"}</b><span class="review-stars">${"★".repeat(rating)}${"☆".repeat(5-rating)}</span><p>${r.comment||""}</p>`;
      box.appendChild(row);
    });
  }

  const form=document.createElement("div");
  form.className="v11-review-form";
  form.innerHTML=`
    <h4>أضيفي تقييمك</h4>
    <input class="v11-review-name" placeholder="اسمك" autocomplete="name">
    <div class="v11-rating-picker" role="radiogroup" aria-label="التقييم من 1 إلى 5">
      <button type="button" data-rating="1" aria-label="نجمة واحدة">★</button>
      <button type="button" data-rating="2" aria-label="نجمتان">★</button>
      <button type="button" data-rating="3" aria-label="3 نجوم">★</button>
      <button type="button" data-rating="4" aria-label="4 نجوم">★</button>
      <button type="button" data-rating="5" aria-label="5 نجوم">★</button>
    </div>
    <textarea class="v11-review-comment" rows="3" placeholder="رأيك في القطعة..."></textarea>
    <button type="button" class="v11-review-submit">إرسال التقييم</button>
    <div class="v11-review-status checkout-status"></div>`;

  let selectedRating=0;
  const stars=[...form.querySelectorAll(".v11-rating-picker button")];
  const paintStars=(value)=>stars.forEach(star=>{
    const active=Number(star.dataset.rating)<=value;
    star.classList.toggle("is-selected",active);
    star.setAttribute("aria-checked",String(active && Number(star.dataset.rating)===value));
  });
  stars.forEach(star=>star.addEventListener("click",()=>{
    selectedRating=Number(star.dataset.rating);
    paintStars(selectedRating);
  }));

  const submit=form.querySelector(".v11-review-submit");
  const statusEl=form.querySelector(".v11-review-status");
  submit.addEventListener("click",async()=>{
    const name=form.querySelector(".v11-review-name").value.trim();
    const comment=form.querySelector(".v11-review-comment").value.trim();
    if(!name||!selectedRating||!comment){
      statusEl.textContent="اكتبي الاسم واختاري عدد النجوم واكتبي رأيك أولاً.";
      statusEl.classList.add("show");
      return;
    }
    if(!productId){
      statusEl.textContent="تعذر إرسال التقييم: لم يتم تحديد المنتج.";
      statusEl.classList.add("show");
      return;
    }
    submit.disabled=true;
    submit.dataset.oldText=submit.textContent;
    submit.textContent="جاري إرسال التقييم...";
    statusEl.textContent="";
    statusEl.classList.remove("show");
    try{
      const {error}=await supabaseClient.from("reviews").insert({
        product_id:productId,
        customer_name:name,
        rating:selectedRating,
        comment,
        approved:false
      });
      if(error)throw error;
      statusEl.textContent="تم إرسال تقييمك للمراجعة ❤️";
      statusEl.classList.add("show");
      form.querySelector(".v11-review-name").value="";
      form.querySelector(".v11-review-comment").value="";
      selectedRating=0;
      paintStars(0);
    }catch(error){
      console.error("Review submit error:",error);
      statusEl.textContent=`تعذر إرسال التقييم: ${error?.message||error}`;
      statusEl.classList.add("show");
    }finally{
      submit.disabled=false;
      submit.textContent=submit.dataset.oldText||"إرسال التقييم";
    }
  });

  box.appendChild(form);
  container.appendChild(box);
}


loadSiteSettings();


/* V12 runtime guard: keeps browser errors visible without breaking the page UI. */
window.addEventListener('unhandledrejection', function (event) {
  console.warn('D&L ACC async error:', event.reason);
});
window.addEventListener('error', function (event) {
  console.warn('D&L ACC browser error:', event.message);
});


/* -----------------------------
   صور السلة + تقييم بعد الطلب
----------------------------- */
function hydrateCartImages() {
    let changed = false;
    cart.forEach(item => {
        if (item.image) return;
        const p = allProducts.find(x => String(x.id) === String(item.id));
        if (p?.image) { item.image = safeImageUrl(p.image); changed = true; }
    });
    if (changed) { saveCart(); updateCartUI(); }
}

function makeStarPicker(onChange) {
    const wrap = document.createElement("div");
    wrap.className = "v11-rating-picker";
    let value = 0;
    const btns = [1, 2, 3, 4, 5].map(n => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = "★";
        b.dataset.rating = n;
        b.setAttribute("aria-label", `${n} من 5`);
        b.addEventListener("click", () => { value = n; paint(); onChange?.(n); });
        wrap.appendChild(b);
        return b;
    });
    function paint() { btns.forEach(b => b.classList.toggle("is-selected", Number(b.dataset.rating) <= value)); }
    return wrap;
}

function openPostOrderReview(items, customerName, orderId) {
    document.getElementById("post-review-modal")?.remove();
    const modal = document.createElement("div");
    modal.id = "post-review-modal";
    modal.className = "post-review-modal";
    const panel = document.createElement("div");
    panel.className = "post-review-panel";
    panel.innerHTML = `<button type="button" class="post-review-close" aria-label="إغلاق"><i class="fas fa-times"></i></button>
        <span class="eyebrow">THANK YOU</span><h2>شكرًا على طلبك 🤍</h2>
        <p class="post-review-sub">رأيك يهمنا! قيّمي الموقع والمنتجات اللي طلبتيها (اختياري).</p>`;
    const state = { site: { rating: 0, comment: "" }, products: {} };

    // تقييم الموقع
    const siteBox = document.createElement("div");
    siteBox.className = "post-review-item";
    const siteTitle = document.createElement("h4");
    siteTitle.textContent = "⭐ تقييم الموقع وتجربة الشراء";
    const siteComment = document.createElement("textarea");
    siteComment.rows = 2;
    siteComment.placeholder = "إيه رأيك في الموقع وتجربة الطلب؟";
    siteComment.addEventListener("input", () => { state.site.comment = siteComment.value.trim(); });
    siteBox.append(siteTitle, makeStarPicker(n => { state.site.rating = n; }), siteComment);
    panel.appendChild(siteBox);

    // تقييم كل منتج (بصورته)
    const seen = new Set();
    items.forEach(item => {
        if (seen.has(String(item.id))) return;
        seen.add(String(item.id));
        const product = allProducts.find(x => String(x.id) === String(item.id));
        const box = document.createElement("div");
        box.className = "post-review-item";
        const head = document.createElement("div");
        head.className = "post-review-head";
        const img = document.createElement("img");
        img.src = safeImageUrl(product?.image || item.image);
        img.alt = item.name || "منتج";
        img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMAGE; };
        const t = document.createElement("h4");
        t.textContent = item.name || "منتج";
        head.append(img, t);
        const ta = document.createElement("textarea");
        ta.rows = 2;
        ta.placeholder = "رأيك في القطعة...";
        const st = (state.products[item.id] = { rating: 0, comment: "" });
        ta.addEventListener("input", () => { st.comment = ta.value.trim(); });
        box.append(head, makeStarPicker(n => { st.rating = n; }), ta);
        panel.appendChild(box);
    });

    const status = document.createElement("div");
    status.className = "checkout-status";
    const actions = document.createElement("div");
    actions.className = "post-review-actions";
    const send = document.createElement("button");
    send.type = "button";
    send.className = "post-review-send";
    send.textContent = "إرسال التقييمات";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "post-review-skip";
    skip.textContent = "لاحقًا";
    actions.append(send, skip);
    panel.append(status, actions);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    document.body.style.overflow = "hidden";

    const close = () => { modal.remove(); document.body.style.overflow = ""; };
    skip.addEventListener("click", close);
    panel.querySelector(".post-review-close").addEventListener("click", close);
    modal.addEventListener("click", e => { if (e.target === modal) close(); });

    send.addEventListener("click", async () => {
        const productRows = Object.entries(state.products)
            .filter(([, v]) => v.rating > 0)
            .map(([id, v]) => ({ product_id: /^\d+$/.test(id) ? Number(id) : id, customer_name: customerName || "عميل", rating: v.rating, comment: v.comment || "", approved: false }));
        if (!state.site.rating && !productRows.length) {
            status.textContent = "اختاري عدد النجوم أولاً أو اضغطي «لاحقًا».";
            status.classList.add("show");
            return;
        }
        send.disabled = true;
        send.textContent = "جاري الإرسال...";
        const errors = [];
        if (productRows.length) {
            const r = await supabaseClient.from("reviews").insert(productRows);
            if (r.error) errors.push(r.error.message);
        }
        if (state.site.rating) {
            const r = await supabaseClient.from("site_reviews").insert({ customer_name: customerName || "عميل", rating: state.site.rating, comment: state.site.comment || "", order_id: orderId || null, approved: false });
            if (r.error) errors.push(r.error.message);
        }
        if (errors.length) {
            console.error("Post-order review error:", errors);
            status.textContent = `تعذر إرسال بعض التقييمات: ${errors[0]}`;
            status.classList.add("show");
            send.disabled = false;
            send.textContent = "إعادة المحاولة";
            return;
        }
        close();
        showToast("شكرًا على تقييمك ❤️ هيظهر بعد المراجعة");
    });
}
