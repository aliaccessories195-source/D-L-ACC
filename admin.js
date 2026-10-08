/* D&L ACC - Admin JavaScript
   Cleaned, session-aware, safer and easier to maintain.
*/

const SUPABASE_URL = "https://aurhnsykqlzmmuibcpft.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_RVS6brwbOqspCPW2QcDRPg_i4V0e2Cy";
const BUCKET = "product-images";
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);

const $ = id => document.getElementById(id);

function pricing(product) {
    const original = Math.max(0, Number(product?.price) || 0);
    const enabled = Boolean(product?.discount_enabled) && Number(product?.discount_value) > 0;
    const type = product?.discount_type === "fixed" ? "fixed" : "percent";
    const value = Math.max(0, Number(product?.discount_value) || 0);
    let sale = original;
    if (enabled) sale = type === "percent" ? original * (1 - Math.min(value, 100) / 100) : original - Math.min(value, original);
    sale = Math.max(0, Math.round(sale * 100) / 100);
    return { original, sale, enabled: enabled && sale < original, type, value, percent: original ? Math.round((1 - sale / original) * 100) : 0 };
}
function adminPrice(value) { return `${Number(value || 0).toLocaleString("ar-EG")} ج.م`; }
function normalizeProductCode(value) {
    return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}
function makeCandidateProductCode() {
    return `DL-${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;
}
async function productCodeExists(code, excludeId = null) {
    const normalized = normalizeProductCode(code);
    if (!normalized) return false;
    let query = supabaseClient.from("products").select("id").eq("product_code", normalized).limit(1);
    if (excludeId != null) query = query.neq("id", Number(excludeId));
    const { data, error } = await query;
    if (error) {
        // If the new column has not been migrated yet, surface the real error to the caller.
        throw error;
    }
    return Array.isArray(data) && data.length > 0;
}
async function generateUniqueProductCode() {
    for (let i = 0; i < 25; i++) {
        const candidate = makeCandidateProductCode();
        if (!(await productCodeExists(candidate))) return candidate;
    }
    throw new Error("تعذر توليد كود فريد. حاول مرة أخرى.");
}

function discountLabel(product) { const p=pricing(product); return p.enabled ? (p.type === "percent" ? `خصم ${p.value}%` : `خصم ${adminPrice(p.value)}`) : "بدون خصم"; }

function status(element, message, type = "") {
    if (!element) return;
    element.textContent = message || "";
    element.className = type ? `status ${type}` : "status";
}

function showAdmin() {
    $("loginCard")?.classList.add("hidden");
    $("adminCard")?.classList.remove("hidden");
}

function showLogin() {
    $("adminCard")?.classList.add("hidden");
    $("loginCard")?.classList.remove("hidden");
}

function getFileExtension(file) {
    const allowed = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif"
    };
    return allowed[file.type] || "jpg";
}

function extractStoragePath(publicUrl) {
    if (!publicUrl) return null;

    try {
        const url = new URL(publicUrl);
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const markerIndex = url.pathname.indexOf(marker);

        if (markerIndex === -1) return null;

        return decodeURIComponent(
            url.pathname.substring(markerIndex + marker.length)
        );
    } catch (_) {
        return null;
    }
}

async function checkSession() {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
        console.error("Session error:", error);
        showLogin();
        return;
    }

    if (data?.session) {
        showAdmin();
        await loadProducts();
        await loadOrders();
    } else {
        showLogin();
    }
}

supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (session) {
        showAdmin();
        loadOrders();
    } else {
        showLogin();
    }
});

async function login() {
    const email = $("email").value.trim();
    const password = $("password").value;

    if (!email || !password) {
        status($("loginStatus"), "اكتب البريد الإلكتروني وكلمة المرور.", "err");
        return;
    }

    $("loginBtn").disabled = true;
    status($("loginStatus"), "جاري تسجيل الدخول...", "ok");

    try {
        const { error } = await supabaseClient.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        status($("loginStatus"), "تم تسجيل الدخول بنجاح ✅", "ok");
        showAdmin();
        await loadProducts();
    } catch (error) {
        console.error("Login error:", error);
        status(
            $("loginStatus"),
            `فشل تسجيل الدخول: ${error.message || error}`,
            "err"
        );
    } finally {
        $("loginBtn").disabled = false;
    }
}

async function logout() {
    $("logoutBtn").disabled = true;

    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) throw error;
    } catch (error) {
        console.error("Logout error:", error);
        status(
            $("addStatus"),
            `تعذر تسجيل الخروج: ${error.message || error}`,
            "err"
        );
    } finally {
        $("logoutBtn").disabled = false;
    }
}

function previewImage() {
    const file = $("imageFile").files[0];

    if (!file) {
        $("preview").removeAttribute("src");
        $("preview").style.display = "none";
        return;
    }

    if (!file.type.startsWith("image/")) {
        status($("addStatus"), "الملف يجب أن يكون صورة.", "err");
        $("imageFile").value = "";
        return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
        status($("addStatus"), "حجم الصورة أكبر من 10MB.", "err");
        $("imageFile").value = "";
        $("preview").removeAttribute("src");
        $("preview").style.display = "none";
        return;
    }

    const oldUrl = $("preview").dataset.objectUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    const objectUrl = URL.createObjectURL(file);
    $("preview").dataset.objectUrl = objectUrl;
    $("preview").src = objectUrl;
    $("preview").style.display = "block";
}

function resetProductForm() {
    $("title").value = "";
    $("productCode").value = "";
    $("price").value = "";
    $("category").value = "";
    if ($("stock")) $("stock").value = "0";
    $("imageFile").value = "";

    const oldUrl = $("preview").dataset.objectUrl;
    if (oldUrl) URL.revokeObjectURL(oldUrl);

    $("preview").removeAttribute("src");
    $("preview").removeAttribute("data-object-url");
    $("preview").style.display = "none";
}

async function addProduct() {
    const title = $("title").value.trim();
    let productCode = normalizeProductCode($("productCode").value);
    const price = Number($("price").value);
    const category = $("category").value;
    const stock = Math.max(0, Math.floor(Number($("stock")?.value || 0)));
    const file = $("imageFile").files[0];

    if (!title || !category || !file || !Number.isFinite(price) || price < 0) {
        status($("addStatus"), "اكمل البيانات واختر صورة صحيحة.", "err");
        return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
        status($("addStatus"), "حجم الصورة أكبر من 10MB.", "err");
        return;
    }

    $("addBtn").disabled = true;
    status($("addStatus"), "جاري التحقق من كود المنتج ورفع الصورة...", "ok");

    try {
        if (!productCode) {
            productCode = await generateUniqueProductCode();
            $("productCode").value = productCode;
        } else if (await productCodeExists(productCode)) {
            status($("addStatus"), "كود المنتج مستخدم بالفعل. اختر كودًا آخر.", "err");
            $("productCode").focus();
            $("addBtn").disabled = false;
            return;
        }
    } catch (codeError) {
        status($("addStatus"), `تعذر التحقق من كود المنتج (شغّل ملف SUPABASE_PRODUCT_CODES.sql): ${codeError.message || codeError}`, "err");
        $("addBtn").disabled = false;
        return;
    }

    status($("addStatus"), "جاري رفع الصورة وحفظ المنتج...", "ok");

    let uploadedPath = null;

    try {
        const extension = getFileExtension(file);
        const randomId =
            typeof crypto?.randomUUID === "function"
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        uploadedPath = `products/${Date.now()}-${randomId}.${extension}`;

        const upload = await supabaseClient.storage
            .from(BUCKET)
            .upload(uploadedPath, file, {
                contentType: file.type,
                upsert: false
            });

        if (upload.error) throw upload.error;

        const { data: publicData } = supabaseClient.storage
            .from(BUCKET)
            .getPublicUrl(uploadedPath);

        const publicUrl = publicData?.publicUrl;

        if (!publicUrl) {
            throw new Error("تعذر الحصول على رابط الصورة.");
        }

        const insert = await supabaseClient
            .from("products")
            .insert({
                title,
                product_code: productCode,
                price,
                category,
                image: publicUrl,
                stock
            })
            .select("id,title,product_code,price,category,image,discount_enabled,discount_type,discount_value")
            .single();

        if (insert.error) {
            throw insert.error;
        }

        resetProductForm();
        status($("addStatus"), "تمت إضافة المنتج والصورة بنجاح ✅", "ok");
        await loadProducts();
    } catch (error) {
        console.error("Add product error:", error);

        if (uploadedPath) {
            try {
                await supabaseClient.storage
                    .from(BUCKET)
                    .remove([uploadedPath]);
            } catch (cleanupError) {
                console.warn("Image cleanup failed:", cleanupError);
            }
        }

        status(
            $("addStatus"),
            `حصل خطأ: ${error.message || error}`,
            "err"
        );
    } finally {
        $("addBtn").disabled = false;
    }
}

async function loadProducts() {
    const list = $("productsList");
    if (!list) return;

    list.textContent = "";
    status($("productsStatus"), "جاري تحميل المنتجات...", "ok");

    try {
        let result = await supabaseClient.from("products").select("id,title,product_code,price,category,image,discount_enabled,discount_type,discount_value").order("id", { ascending: false });
        if (result.error) result = await supabaseClient.from("products").select("id,title,product_code,price,category,image").order("id", { ascending: false });
        if (result.error) throw result.error;
        if ((result.data || []).some(p => !p.product_code)) console.warn("بعض المنتجات بدون كود - شغّل SUPABASE_PRODUCT_CODES.sql");
        const data = (result.data || []).map(p => ({...p, discount_enabled:Boolean(p.discount_enabled), discount_type:p.discount_type||"percent", discount_value:Number(p.discount_value||0)}));

        if (!data || data.length === 0) {
            status($("productsStatus"), "لا توجد منتجات حاليًا.", "ok");
            return;
        }

        $("productsStatus").className = "status";
        window.adminProductsCache = data;
        populateDiscountProducts(data);

        data.forEach(product => {
            list.appendChild(createProductCard(product));
        });
    } catch (error) {
        console.error("Load products error:", error);
        status(
            $("productsStatus"),
            `فشل تحميل المنتجات: ${error.message || error}`,
            "err"
        );
    }
}

function createProductCard(product) {
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.search = `${product.title || ""} ${product.product_code || ""} ${product.category || ""}`.toLowerCase();

    if (product.image) {
        const img = document.createElement("img");
        img.src = product.image;
        img.alt = product.title || "منتج";
        img.loading = "lazy";
        img.onerror = () => {
            img.onerror = null;
            img.replaceWith(createNoImage());
        };
        card.appendChild(img);
    } else {
        card.appendChild(createNoImage());
    }

    const info = document.createElement("div");
    info.className = "product-info";

    const title = document.createElement("h3");
    title.textContent = product.title || "بدون اسم";

    const meta = document.createElement("div");
    meta.className = "product-meta";

    const category = document.createElement("span");
    category.textContent = product.category || "بدون تصنيف";

    const code = document.createElement("span");
    code.className = "product-code-badge";
    code.textContent = product.product_code || "بدون كود";

    const price = document.createElement("strong");
    const p = pricing(product);
    if (p.enabled) {
        price.innerHTML = `<span class="discount-old">${adminPrice(p.original)}</span><span class="discount-new">${adminPrice(p.sale)}</span>`;
        const badge = document.createElement("div"); badge.className="discount-badge"; badge.textContent=`🔥 ${discountLabel(product)}`;
        meta.after(badge);
    } else {
        price.textContent = adminPrice(p.original);
    }

    meta.append(category, code, price);

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-product";
    editButton.innerHTML = '<i class="fa-solid fa-pen"></i><span>تعديل</span>';
    editButton.addEventListener("click", () => editProduct(product));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-product";
    deleteButton.innerHTML = '<i class="fa-solid fa-trash-can"></i><span>حذف</span>';
    deleteButton.addEventListener("click", () => deleteProduct(product.id));

    info.append(title, meta, editButton, deleteButton);
    card.appendChild(info);

    return card;
}

let editingProductId = null;

function closeEditModal() {
    const modal = $("editModal");
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    editingProductId = null;
}

function editProduct(product) {
    if (!product || product.id == null) return;
    // التأكد من حفظ الـ ID كرقم صحيح (Number) لتطابق نوع الـ int8 في قاعدة البيانات
    editingProductId = Number(product.id);
    console.log("جاري تعديل المنتج برقم ID:", editingProductId);

    $("editTitle").value = product.title || "";
    $("editProductCode").value = product.product_code || "";
    $("editPrice").value = product.price ?? "";
    $("editCategory").value = product.category || "";
    $("editDiscountType").value = product.discount_type === "fixed" ? "fixed" : "percent";
    $("editDiscountValue").value = product.discount_value ?? 0;
    $("editDiscountEnabled").checked = Boolean(product.discount_enabled);
    
    const modal = $("editModal");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    $("editTitle").focus();
}

$("editProductForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (editingProductId == null) {
        alert("خطأ: لم يتم تحديد أي منتج للتعديل!");
        return;
    }

    const title = $("editTitle").value.trim();
    const productCode = normalizeProductCode($("editProductCode").value);
    const price = Number($("editPrice").value);
    const category = $("editCategory").value.trim();
    const stock = Math.max(0, Math.floor(Number($("editStock")?.value || 0)));
    const discountType = $("editDiscountType").value === "fixed" ? "fixed" : "percent";
    const discountValue = Number($("editDiscountValue").value || 0);
    const discountEnabled = $("editDiscountEnabled").checked;

    if (!title || !productCode || !category || !Number.isFinite(price) || price < 0 || !Number.isFinite(discountValue) || discountValue < 0 || (discountType === "percent" && discountValue > 100) || (discountType === "fixed" && discountValue > price)) {
        alert("من فضلك اكتب اسمًا وتصنيفًا وسعرًا صحيحًا.");
        return;
    }

    $("saveEditBtn").disabled = true;
    status($("productsStatus"), "جاري حفظ التعديلات في قاعدة البيانات...", "ok");

    try {
        if (await productCodeExists(productCode, editingProductId)) {
            throw new Error("كود المنتج مستخدم بالفعل مع منتج آخر.");
        }

        // إجبار الـ ID على أن يكون رقماً صحيحاً وتحديث السعر والبيانات بدقة
        const { data, error } = await supabaseClient
            .from("products")
            .update({ title: title, product_code: productCode, price: price, category: category, stock, discount_enabled: discountEnabled, discount_type: discountType, discount_value: discountValue })
            .eq("id", Number(editingProductId))
            .select();

        if (error) throw error;

        if (!data || data.length === 0) {
            throw new Error("لم يتم العثور على المنتج في قاعدة البيانات لتحديثه.");
        }

        console.log("تم التعديل بنجاح:", data);
        closeEditModal();
        await loadProducts();
        status($("productsStatus"), "تم حفظ التعديلات في Supabase بنجاح ✅", "ok");
    } catch (error) {
        console.error("Edit product error:", error);
        status($("productsStatus"), `فشل حفظ التعديلات: ${error.message || error}`, "err");
        alert(`فشل الحفظ: ${error.message}`);
    } finally {
        $("saveEditBtn").disabled = false;
    }
});

$("closeEditModal").addEventListener("click", closeEditModal);
$("cancelEditBtn").addEventListener("click", closeEditModal);
$("editModal").addEventListener("click", (event) => {
    if (event.target.id === "editModal") closeEditModal();
});

function createNoImage() {
    const noImage = document.createElement("div");
    noImage.className = "no-image";
    noImage.textContent = "لا توجد صورة";
    return noImage;
}

async function deleteProduct(id) {
    if (id == null) return;

    if (!confirm("هل أنت متأكد من حذف هذا المنتج؟")) return;

    $("loadProductsBtn").disabled = true;
    status($("productsStatus"), "جاري حذف المنتج...", "ok");

    try {
        const { data: product, error: fetchError } = await supabaseClient
            .from("products")
            .select("image")
            .eq("id", Number(id))
            .single();

        if (fetchError) throw fetchError;

        const { error: deleteError } = await supabaseClient
            .from("products")
            .delete()
            .eq("id", Number(id));

        if (deleteError) throw deleteError;

        if (product?.image) {
            const path = extractStoragePath(product.image);

            if (path) {
                const { error: storageError } = await supabaseClient
                    .storage
                    .from(BUCKET)
                    .remove([path]);

                if (storageError) {
                    console.warn("تم حذف المنتج لكن تعذر حذف الصورة:", storageError);
                }
            }
        }

        await loadProducts();
        status($("productsStatus"), "تم حذف المنتج بنجاح ✅", "ok");
    } catch (error) {
        console.error("Delete product error:", error);
        status(
            $("productsStatus"),
            `فشل حذف المنتج: ${error.message || error}`,
            "err"
        );
    } finally {
        $("loadProductsBtn").disabled = false;
    }
}

$("loginBtn")?.addEventListener("click", login);
$("logoutBtn")?.addEventListener("click", logout);
$("imageFile")?.addEventListener("change", previewImage);
$("addBtn")?.addEventListener("click", addProduct);
$("loadProductsBtn")?.addEventListener("click", loadProducts);
$("generateProductCodeBtn")?.addEventListener("click", async () => {
    const btn = $("generateProductCodeBtn");
    btn.disabled = true;
    try {
        $("productCode").value = await generateUniqueProductCode();
        status($("addStatus"), "تم توليد كود منتج فريد ✅", "ok");
    } catch (error) {
        status($("addStatus"), `تعذر توليد الكود: ${error.message || error}`, "err");
    } finally {
        btn.disabled = false;
    }
});
$("adminProductSearch")?.addEventListener("input", () => {
    const q = normalizeProductCode($("adminProductSearch").value).toLowerCase();
    const cards = document.querySelectorAll("#productsList .product-card");
    cards.forEach(card => {
        const hay = (card.dataset.search || "").toLowerCase();
        card.style.display = !q || hay.includes(q) ? "" : "none";
    });
});
$("clearAdminProductSearch")?.addEventListener("click", () => {
    if ($("adminProductSearch")) $("adminProductSearch").value = "";
    document.querySelectorAll("#productsList .product-card").forEach(card => card.style.display = "");
});

$("password")?.addEventListener("keydown", event => {
    if (event.key === "Enter") login();
});

window.addEventListener("beforeunload", () => {
    const objectUrl = $("preview")?.dataset.objectUrl;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
});

/* ================= V7 ORDERS + DASHBOARD ================= */
function formatAdminPrice(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${n.toLocaleString("ar-EG")} ج.م` : "—";
}

function orderStatusLabel(status) {
    return ({new:"جديد", processing:"قيد التجهيز", shipped:"تم الشحن", delivered:"تم التسليم", cancelled:"ملغي"})[status] || status || "جديد";
}

async function loadOrders() {
    const body = $("ordersTableBody");
    if (!body) return;
    status($("ordersStatus"), "جاري تحميل الطلبات...", "ok");
    try {
        const { data, error } = await supabaseClient
            .from("orders")
            .select("id,customer_name,phone,address,items,total,status,created_at")
            .order("created_at", { ascending: false });
        if (error) throw error;
        body.textContent = "";
        const orders = Array.isArray(data) ? data : [];
        const newCount = orders.filter(o => o.status === "new").length;
        const sales = orders.filter(o => o.status !== "cancelled").reduce((sum,o) => sum + Number(o.total || 0), 0);
        $("statOrders").textContent = orders.length.toLocaleString("ar-EG");
        $("statNewOrders").textContent = newCount.toLocaleString("ar-EG");
        $("statSales").textContent = formatAdminPrice(sales);
        if (!orders.length) {
            body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">لا توجد طلبات محفوظة حتى الآن.</td></tr>';
        } else {
            orders.forEach(order => body.appendChild(createOrderRow(order)));
        }
        status($("ordersStatus"), `تم تحميل ${orders.length.toLocaleString("ar-EG")} طلب.`, "ok");
    } catch (error) {
        console.warn("Orders table unavailable:", error);
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">جدول الطلبات غير مفعّل بعد.</td></tr>';
        status($("ordersStatus"), "لم يتم تفعيل جدول orders بعد. شغّل ملف SUPABASE_V8_ORDERS.sql مرة واحدة في Supabase.", "err");
        $("statOrders").textContent = "—";
        $("statNewOrders").textContent = "—";
        $("statSales").textContent = "—";
    }
}

function createOrderRow(order) {
    const tr = document.createElement("tr");
    const id = document.createElement("td"); id.textContent = `#${order.id}`;
    const customer = document.createElement("td");
    customer.innerHTML = `<strong></strong><br><span style="color:var(--muted);font-size:12px"></span>`;
    customer.querySelector("strong").textContent = order.customer_name || "بدون اسم";
    customer.querySelector("span").textContent = order.phone || "—";
    const contact = document.createElement("td");
    contact.innerHTML = `<span style="display:block;max-width:190px;line-height:1.7"></span>`;
    contact.querySelector("span").textContent = order.address || "—";
    const items = document.createElement("td"); items.className = "order-items";
    const arr = Array.isArray(order.items) ? order.items : [];
    items.textContent = arr.map(x => `${x.name || "منتج"} × ${x.quantity || 1}`).join("، ") || "—";
    const total = document.createElement("td"); total.textContent = formatAdminPrice(order.total);
    const statusCell = document.createElement("td");
    const select = document.createElement("select"); select.className = "order-status-select";
    ["new","processing","shipped","delivered","cancelled"].forEach(value => {
        const option = document.createElement("option"); option.value = value; option.textContent = orderStatusLabel(value); option.selected = value === order.status; select.appendChild(option);
    });
    select.addEventListener("change", () => updateOrderStatus(order.id, select.value, select));
    statusCell.appendChild(select);
    const date = document.createElement("td"); date.className = "order-date";
    date.textContent = order.created_at ? new Date(order.created_at).toLocaleString("ar-EG") : "—";
    tr.append(id, customer, contact, items, total, statusCell, date);
    return tr;
}

async function updateOrderStatus(id, nextStatus, select) {
    if (select) select.disabled = true;
    try {
        const { error } = await supabaseClient.from("orders").update({ status: nextStatus }).eq("id", id);
        if (error) throw error;
        status($("ordersStatus"), `تم تحديث حالة الطلب #${id} إلى ${orderStatusLabel(nextStatus)} ✅`, "ok");
        await loadOrders();
    } catch (error) {
        status($("ordersStatus"), `تعذر تحديث الطلب: ${error.message || error}`, "err");
        if (select) select.disabled = false;
    }
}

const originalLoadProductsV7 = loadProducts;
loadProducts = async function() {
    await originalLoadProductsV7();
    const count = document.querySelectorAll("#productsList .product-card").length;
    if ($("statProducts")) $("statProducts").textContent = count.toLocaleString("ar-EG");
};

$("loadOrdersBtn")?.addEventListener("click", loadOrders);

/* ================= V8 ORDER CENTER ================= */
let v8OrdersCache = [];

function renderOrders() {
    const body = $("ordersTableBody");
    if (!body) return;
    const q = ($("orderSearch")?.value || "").trim().toLowerCase();
    const filter = $("orderFilter")?.value || "all";
    const filtered = v8OrdersCache.filter(order => {
        const hay = [order.id, order.customer_name, order.phone, order.address].join(" ").toLowerCase();
        return (!q || hay.includes(q)) && (filter === "all" || order.status === filter);
    });
    body.textContent = "";
    if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:30px">لا توجد نتائج مطابقة.</td></tr>';
        return;
    }
    filtered.forEach(order => body.appendChild(createOrderRowV8(order)));
}

function createOrderRowV8(order) {
    const tr = document.createElement("tr");
    const id = document.createElement("td"); id.innerHTML = `<span class="v8-badge">#${order.id}</span>`;
    const customer = document.createElement("td");
    const strong = document.createElement("strong"); strong.textContent = order.customer_name || "بدون اسم";
    const phone = document.createElement("div"); phone.textContent = order.phone || "—"; phone.style.cssText = "color:var(--muted);font-size:12px;margin-top:4px";
    customer.append(strong, phone);
    const contact = document.createElement("td"); contact.textContent = order.address || "—"; contact.style.maxWidth = "190px";
    const items = document.createElement("td"); items.className = "order-items";
    const arr = Array.isArray(order.items) ? order.items : [];
    items.textContent = arr.map(x => `${x.name || "منتج"} × ${x.quantity || 1}`).join("، ") || "—";
    const total = document.createElement("td"); total.textContent = formatAdminPrice(order.total);
    const statusCell = document.createElement("td");
    const select = document.createElement("select"); select.className = "order-status-select";
    ["new","processing","shipped","delivered","cancelled"].forEach(value => {
        const option = document.createElement("option"); option.value = value; option.textContent = orderStatusLabel(value); option.selected = value === order.status; select.appendChild(option);
    });
    select.addEventListener("change", () => updateOrderStatus(order.id, select.value, select));
    statusCell.appendChild(select);
    const date = document.createElement("td"); date.className = "order-date"; date.textContent = order.created_at ? new Date(order.created_at).toLocaleString("ar-EG") : "—";
    const view = document.createElement("td");
    const viewBtn = document.createElement("button"); viewBtn.type = "button"; viewBtn.className = "order-view-btn"; viewBtn.textContent = "التفاصيل"; viewBtn.addEventListener("click", () => openOrderDetails(order));
    view.appendChild(viewBtn);
    tr.append(id, customer, contact, items, total, statusCell, date, view);
    return tr;
}

function openOrderDetails(order) {
    const modal = $("orderDetailModal"), content = $("orderDetailContent");
    if (!modal || !content) return;
    const items = Array.isArray(order.items) ? order.items : [];
    content.innerHTML = "";
    const grid = document.createElement("div"); grid.className = "order-detail-grid";
    [["رقم الطلب", `#${order.id}`],["الحالة", orderStatusLabel(order.status)],["العميل", order.customer_name || "—"],["الموبايل", order.phone || "—"],["العنوان", order.address || "—"],["التاريخ", order.created_at ? new Date(order.created_at).toLocaleString("ar-EG") : "—"]].forEach(([label,value]) => {
        const box = document.createElement("div"); box.className = "detail-box"; box.innerHTML = `<small></small><strong></strong>`; box.querySelector("small").textContent = label; box.querySelector("strong").textContent = value; grid.appendChild(box);
    });
    const itemsTitle = document.createElement("h3"); itemsTitle.textContent = "المنتجات";
    const list = document.createElement("div"); list.className = "detail-items";
    items.forEach(item => { const row=document.createElement("div"); row.className="detail-item"; row.innerHTML='<span></span><strong></strong>'; row.querySelector("span").textContent=`${item.name || "منتج"} × ${item.quantity || 1}`; row.querySelector("strong").textContent=formatAdminPrice((Number(item.price)||0)*(Number(item.quantity)||1)); list.appendChild(row); });
    const total = document.createElement("div"); total.style.cssText="display:flex;justify-content:space-between;margin-top:16px;font-size:18px"; total.innerHTML='<span>الإجمالي</span><strong></strong>'; total.querySelector("strong").textContent=formatAdminPrice(order.total);
    content.append(grid, itemsTitle, list, total);
    modal.classList.remove("hidden"); modal.setAttribute("aria-hidden","false"); document.body.style.overflow="hidden";
}

function closeOrderDetails() { const modal=$("orderDetailModal"); if(modal){modal.classList.add("hidden");modal.setAttribute("aria-hidden","true");document.body.style.overflow="";} }

async function loadOrdersV8() {
    try {
        const { data, error } = await supabaseClient.from("orders").select("id,customer_name,phone,address,items,total,status,created_at").order("created_at", {ascending:false});
        if (error) throw error;
        v8OrdersCache = Array.isArray(data) ? data : [];
        const newCount=v8OrdersCache.filter(o=>o.status==="new").length;
        const sales=v8OrdersCache.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+Number(o.total||0),0);
        if($("statOrders")) $("statOrders").textContent=v8OrdersCache.length.toLocaleString("ar-EG");
        if($("statNewOrders")) $("statNewOrders").textContent=newCount.toLocaleString("ar-EG");
        if($("statSales")) $("statSales").textContent=formatAdminPrice(sales);
        renderOrders();
        status($("ordersStatus"), `تم تحديث مركز الطلبات — ${v8OrdersCache.length.toLocaleString("ar-EG")} طلب.`, "ok");
    } catch(error) {
        console.warn("V8 orders unavailable", error);
        v8OrdersCache=[]; renderOrders();
        status($("ordersStatus"), "لم يتم تفعيل جدول orders بعد. شغّل ملف SUPABASE_V8_ORDERS.sql مرة واحدة في Supabase.", "err");
        ["statOrders","statNewOrders","statSales"].forEach(id=>{if($(id)) $(id).textContent="—";});
    }
}

function exportOrdersCSV() {
    if (!v8OrdersCache.length) { status($("ordersStatus"), "لا توجد طلبات لتصديرها.", "err"); return; }
    const rows=[["Order ID","Customer","Phone","Address","Items","Total","Status","Created At"],...v8OrdersCache.map(o=>[o.id,o.customer_name,o.phone,o.address,(Array.isArray(o.items)?o.items:[]).map(i=>`${i.name} x${i.quantity||1}`).join(" | "),o.total,orderStatusLabel(o.status),o.created_at])];
    const csv="\ufeff"+rows.map(r=>r.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`DL-ACC-orders-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

let adminProductsCache = [];
function populateDiscountProducts(products) {
    adminProductsCache = Array.isArray(products) ? products : [];
    const select = $("discountProduct"); if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">اختاري منتجًا</option>';
    adminProductsCache.forEach(product => { const o=document.createElement("option"); o.value=String(product.id); o.textContent=`${product.title || "منتج"} — ${adminPrice(pricing(product).sale)}`; select.appendChild(o); });
    if (adminProductsCache.some(p=>String(p.id)===current)) select.value=current;
    updateDiscountPreview();
}
function getDiscountProduct() { const id=$("discountProduct")?.value; return adminProductsCache.find(p=>String(p.id)===String(id)); }
function updateDiscountPreview() {
    const product=getDiscountProduct(), preview=$("discountPreview"); if(!preview) return;
    if(!product){ preview.textContent="اختاري منتجًا لعرض السعر بعد الخصم"; return; }
    const original=Number(product.price)||0, type=$("discountType")?.value||"percent", value=Math.max(0,Number($("discountValue")?.value||0));
    const sale=type==="percent" ? original*(1-Math.min(value,100)/100) : original-Math.min(value,original);
    preview.innerHTML=`السعر: <span class="discount-old">${adminPrice(original)}</span> <span class="discount-new">${adminPrice(Math.max(0,sale))}</span> <span class="discount-badge">🔥 ${type==="percent"?`خصم ${value}%`:`خصم ${adminPrice(value)}`}</span>`;
}
async function saveDiscount(enabled) {
    const product=getDiscountProduct(); if(!product){ status($("discountStatus"),"اختاري منتجًا أولاً.","err"); return; }
    const type=$("discountType").value === "fixed" ? "fixed" : "percent";
    const value=Number($("discountValue").value || 0), price=Number(product.price)||0;
    if(!Number.isFinite(value)||value<0 || (type==="percent"&&value>100) || (type==="fixed"&&value>price)){ status($("discountStatus"),type==="percent"?"النسبة يجب أن تكون بين 0 و100%.":"قيمة الخصم لا يمكن أن تتجاوز السعر الأصلي.","err"); return; }
    try { const {error}=await supabaseClient.from("products").update({discount_enabled:enabled,discount_type:type,discount_value:value}).eq("id",Number(product.id)); if(error) throw error; status($("discountStatus"),enabled?"تم تفعيل الخصم بنجاح 🔥":"تمت إزالة الخصم بنجاح.","ok"); await loadProducts(); const fresh=adminProductsCache.find(p=>String(p.id)===String(product.id)); if(fresh){$("discountProduct").value=String(fresh.id); $("discountType").value=fresh.discount_type||"percent"; $("discountValue").value=fresh.discount_value||0; updateDiscountPreview();} } catch(error){ status($("discountStatus"),`فشل حفظ الخصم: ${error.message||error}`,"err"); }
}
$("discountProduct")?.addEventListener("change",()=>{const p=getDiscountProduct(); if(p){$("discountType").value=p.discount_type||"percent";$("discountValue").value=p.discount_value||0;} updateDiscountPreview();});
$("discountType")?.addEventListener("change",updateDiscountPreview); $("discountValue")?.addEventListener("input",updateDiscountPreview);
$("applyDiscountBtn")?.addEventListener("click",()=>saveDiscount(true)); $("removeDiscountBtn")?.addEventListener("click",()=>saveDiscount(false));

$("orderSearch")?.addEventListener("input", renderOrders);
$("orderFilter")?.addEventListener("change", renderOrders);
$("exportOrdersBtn")?.addEventListener("click", exportOrdersCSV);
$("closeOrderDetail")?.addEventListener("click", closeOrderDetails);
$("orderDetailModal")?.addEventListener("click", e=>{if(e.target.id==="orderDetailModal") closeOrderDetails();});
const oldLoadOrdersBtn=document.getElementById("loadOrdersBtn");
if(oldLoadOrdersBtn){oldLoadOrdersBtn.removeEventListener("click", loadOrders); oldLoadOrdersBtn.addEventListener("click", loadOrdersV8);}
loadOrders = loadOrdersV8;



// V10: تقسيم لوحة الإدارة إلى أقسام واضحة
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t === tab));
    document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.toggle('active', panel.id === target));
    if (target === 'productsPanel') {
      loadProducts();
    } else if (target === 'discountsPanel') {
      loadProducts();
    } else if (target === 'customersPanel') {
      loadOrdersV8();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});


/* =============================
   V11: Dashboard / Inventory / Offers / Coupons / Reviews / Invoices / Settings
============================= */
let v11Coupons = [], v11Reviews = [], v11Settings = {};
const v11Money = v => `${Number(v||0).toLocaleString("ar-EG")} ج.م`;
function v11Date(v){ return v ? new Date(v).toLocaleDateString("ar-EG") : "—"; }
function v11IsoInput(v){ if(!v) return ""; const d=new Date(v); if(Number.isNaN(d.getTime())) return ""; return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
function v11OfferActive(p){ const now=Date.now(); return Boolean(p.offer_enabled) && (!p.offer_starts_at || new Date(p.offer_starts_at).getTime()<=now) && (!p.offer_ends_at || new Date(p.offer_ends_at).getTime()>=now); }

async function loadProductsV11(){
  const list=$("productsList"); if(!list) return;
  try{
    let q=await supabaseClient.from("products").select("id,title,product_code,price,category,image,stock,discount_enabled,discount_type,discount_value,offer_enabled,offer_name,offer_type,offer_value,offer_starts_at,offer_ends_at").order("id",{ascending:false});
    if(q.error){ q=await supabaseClient.from("products").select("id,title,product_code,price,category,image,discount_enabled,discount_type,discount_value").order("id",{ascending:false}); }
    if(q.error) throw q.error;
    adminProductsCache=(q.data||[]).map(p=>({...p,stock:Number(p.stock||0),discount_enabled:Boolean(p.discount_enabled),discount_type:p.discount_type||"percent",discount_value:Number(p.discount_value||0),offer_enabled:Boolean(p.offer_enabled),offer_type:p.offer_type||"percent",offer_value:Number(p.offer_value||0)}));
    list.textContent=""; populateDiscountProducts(adminProductsCache); populateOfferProducts(); renderInventory(); renderOffers();
    adminProductsCache.forEach(p=>list.appendChild(createProductCard(p)));
    if($("statProducts")) $("statProducts").textContent=adminProductsCache.length.toLocaleString("ar-EG");
  }catch(e){ console.error(e); status($("productsStatus"),`فشل تحميل المنتجات: ${e.message||e}`,"err"); }
}
loadProducts=loadProductsV11;

function renderInventory(){
  const root=$("inventoryGrid"); if(!root) return; root.textContent="";
  const search=($("inventorySearch")?.value||"").trim().toLowerCase(), filter=$("inventoryFilter")?.value||"all";
  const rows=adminProductsCache.filter(p=>{ const hit=`${p.title||""} ${p.category||""}`.toLowerCase().includes(search); if(!hit)return false; if(filter==="low")return p.stock>0&&p.stock<=5; if(filter==="out")return p.stock<=0; return true; });
  if(!rows.length){root.innerHTML='<div class="muted-v11">لا توجد منتجات مطابقة.</div>';return;}
  rows.forEach(p=>{ const row=document.createElement("div");row.className="inventory-item"; const info=document.createElement("div"); info.innerHTML=`<b>${p.title||"منتج"}</b><div class="muted-v11">${p.category||"—"}</div>`; const pill=document.createElement("span"); pill.className=`stock-pill ${p.stock<=0?"out":p.stock<=5?"low":""}`;pill.textContent=p.stock<=0?"نفد المخزون":`المتاح: ${p.stock}`; info.appendChild(pill); const actions=document.createElement("div");actions.className="inventory-actions"; const input=document.createElement("input");input.type="number";input.min="0";input.step="1";input.value=p.stock; const btn=document.createElement("button");btn.type="button";btn.textContent="حفظ";btn.style.width="auto";btn.style.margin="0";btn.addEventListener("click",async()=>{const stock=Math.max(0,Math.floor(Number(input.value)||0));btn.disabled=true;try{const {error}=await supabaseClient.from("products").update({stock}).eq("id",p.id);if(error)throw error;p.stock=stock;renderInventory();renderProductsStockBadges();await refreshV11Dashboard();}catch(e){status($("inventoryStatus"),`فشل تحديث المخزون: ${e.message||e}`,"err");}finally{btn.disabled=false;}});actions.append(input,btn);row.append(info,actions);root.appendChild(row); });
}
function renderProductsStockBadges(){ document.querySelectorAll(".product-card").forEach((card,i)=>{const p=adminProductsCache[i]; if(!p)return;}); }
$("inventorySearch")?.addEventListener("input",renderInventory); $("inventoryFilter")?.addEventListener("change",renderInventory); $("refreshInventoryBtn")?.addEventListener("click",loadProductsV11);

function populateOfferProducts(){ const s=$("offerProduct"); if(!s)return; const current=s.value; s.innerHTML='<option value="">اختاري منتجًا</option>'; adminProductsCache.forEach(p=>{const o=document.createElement("option");o.value=p.id;o.textContent=`${p.title||"منتج"} — ${v11Money(p.price)}`;s.appendChild(o)});if(adminProductsCache.some(p=>String(p.id)===current))s.value=current;updateOfferPreview(); }
function updateOfferPreview(){const p=adminProductsCache.find(x=>String(x.id)===$("offerProduct")?.value), out=$("offerPreview");if(!out)return;if(!p){out.textContent="اختاري منتجًا";return}const type=$("offerType")?.value||"percent",v=Math.max(0,Number($("offerValue")?.value||0)),sale=type==="percent"?Number(p.price)*(1-Math.min(v,100)/100):Number(p.price)-Math.min(v,Number(p.price));out.innerHTML=`السعر بعد العرض: <span class="discount-old">${v11Money(p.price)}</span> <span class="discount-new">${v11Money(Math.max(0,sale))}</span>`;}
$("offerProduct")?.addEventListener("change",()=>{const p=adminProductsCache.find(x=>String(x.id)===$("offerProduct").value);if(p){$("offerName").value=p.offer_name||"";$("offerType").value=p.offer_type||"percent";$("offerValue").value=p.offer_value||0;$("offerStarts").value=v11IsoInput(p.offer_starts_at);$("offerEnds").value=v11IsoInput(p.offer_ends_at);}updateOfferPreview();});$("offerType")?.addEventListener("change",updateOfferPreview);$("offerValue")?.addEventListener("input",updateOfferPreview);
async function saveOffer(enabled){const id=$("offerProduct")?.value,p=adminProductsCache.find(x=>String(x.id)===String(id));if(!p){status($("offerStatus"),"اختاري منتجًا أولاً.","err");return}const type=$("offerType").value,value=Number($("offerValue").value||0),start=$("offerStarts").value?new Date($("offerStarts").value).toISOString():null,end=$("offerEnds").value?new Date($("offerEnds").value).toISOString():null;if(value<0||(type==="percent"&&value>100)||(type==="fixed"&&value>Number(p.price))){status($("offerStatus"),"قيمة العرض غير صحيحة.","err");return}if(start&&end&&new Date(start)>=new Date(end)){status($("offerStatus"),"تاريخ النهاية يجب أن يكون بعد البداية.","err");return}try{const {error}=await supabaseClient.from("products").update({offer_enabled:enabled,offer_name:$("offerName").value.trim(),offer_type:type,offer_value:value,offer_starts_at:start,offer_ends_at:end}).eq("id",p.id);if(error)throw error;status($("offerStatus"),enabled?"تم تفعيل العرض ⚡":"تمت إزالة العرض.","ok");await loadProductsV11();}catch(e){status($("offerStatus"),`فشل حفظ العرض: ${e.message||e}`,"err")}}
$("saveOfferBtn")?.addEventListener("click",()=>saveOffer(true));$("removeOfferBtn")?.addEventListener("click",()=>saveOffer(false));
function renderOffers(){const root=$("offersList");if(!root)return;root.textContent="";const active=adminProductsCache.filter(p=>p.offer_enabled);if(!active.length){root.innerHTML='<div class="muted-v11">لا توجد عروض مضافة.</div>';return}active.forEach(p=>{const r=document.createElement("div");r.className="offer-row";r.innerHTML=`<div><b>${p.offer_name||"عرض موسمي"}</b><div class="muted-v11">${p.title} • ${p.offer_type==="percent"?p.offer_value+"%":v11Money(p.offer_value)} • ${v11Date(p.offer_starts_at)} → ${v11Date(p.offer_ends_at)}</div></div><span class="v8-badge">${v11OfferActive(p)?"فعال الآن":"مجدول"}</span>`;root.appendChild(r)});}

async function loadCoupons(){const root=$("couponsList");if(!root)return;try{const {data,error}=await supabaseClient.from("coupons").select("*").order("created_at",{ascending:false});if(error)throw error;v11Coupons=data||[];root.textContent="";if(!v11Coupons.length){root.innerHTML='<div class="muted-v11">لا توجد أكواد حتى الآن.</div>';return}v11Coupons.forEach(c=>{const r=document.createElement("div");r.className="coupon-row";r.innerHTML=`<div><div class="coupon-code">${c.code}</div><div class="muted-v11">${c.discount_percent}% • حد أدنى ${v11Money(c.min_order)} • الاستخدام ${c.used_count}/${c.usage_limit||"∞"} • ينتهي ${v11Date(c.expires_at)}</div></div>`;const acts=document.createElement("div");acts.className="row-actions";const toggle=document.createElement("button");toggle.type="button";toggle.textContent=c.active?"إيقاف":"تفعيل";toggle.addEventListener("click",async()=>{await supabaseClient.from("coupons").update({active:!c.active}).eq("id",c.id);loadCoupons();});const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="حذف";del.addEventListener("click",async()=>{if(confirm(`حذف الكود ${c.code}؟`)){await supabaseClient.from("coupons").delete().eq("id",c.id);loadCoupons();}});acts.append(toggle,del);r.append(acts);root.appendChild(r)});}catch(e){status($("couponStatus"),`فشل تحميل الأكواد: ${e.message||e}`,"err")}}
async function saveCoupon(){const code=$("couponCode").value.trim().toUpperCase().replace(/\s+/g,"");const percent=Number($("couponPercent").value),min=Number($("couponMin").value||0),limit=Math.max(0,Math.floor(Number($("couponLimit").value||0))),expires=$("couponExpires").value?new Date($("couponExpires").value).toISOString():null;if(!/^[A-Z0-9_-]{3,30}$/.test(code)||percent<=0||percent>100||min<0){status($("couponStatus"),"راجعي الكود ونسبة الخصم والحد الأدنى.","err");return}try{const {error}=await supabaseClient.from("coupons").insert({code,discount_percent:percent,min_order:min,usage_limit:limit,expires_at:expires,active:true});if(error)throw error;status($("couponStatus"),`تم حفظ الكود ${code} 🎟️`,"ok");clearCouponForm();loadCoupons();refreshV11Dashboard();}catch(e){status($("couponStatus"),`فشل حفظ الكود: ${e.message||e}`,"err")}}
function clearCouponForm(){["couponCode","couponPercent","couponMin","couponLimit","couponExpires"].forEach(id=>{if($(id))$(id).value=""})}$("saveCouponBtn")?.addEventListener("click",saveCoupon);$("clearCouponBtn")?.addEventListener("click",clearCouponForm);

async function loadReviews(){const root=$("reviewsList");if(!root)return;try{const {data,error}=await supabaseClient.from("reviews").select("id,product_id,customer_name,rating,comment,approved,created_at,products(title)").order("created_at",{ascending:false});if(error)throw error;v11Reviews=data||[];try{const sr=await supabaseClient.from("site_reviews").select("*").order("created_at",{ascending:false});if(!sr.error)v11Reviews=v11Reviews.concat((sr.data||[]).map(x=>({...x,_site:true,products:{title:"⭐ تقييم الموقع"}})));}catch(_){}renderReviews();}catch(e){status($("reviewsStatus"),`فشل تحميل التقييمات: ${e.message||e}`,"err")}}
function renderReviews(){const root=$("reviewsList");if(!root)return;root.textContent="";const f=$("reviewFilter")?.value||"pending";const rows=v11Reviews.filter(r=>f==="all"||(f==="approved"?r.approved:!r.approved));if(!rows.length){root.innerHTML='<div class="muted-v11">لا توجد تقييمات في هذا القسم.</div>';return}rows.forEach(r=>{const row=document.createElement("div");row.className="review-row";const stars="★".repeat(r.rating)+"☆".repeat(5-r.rating);row.innerHTML=`<div><b>${r.customer_name}</b><div class="muted-v11">${r.products?.title||"منتج"} • ${v11Date(r.created_at)}</div><div class="review-stars">${stars}</div><div class="review-comment">${r.comment}</div></div>`;const acts=document.createElement("div");acts.className="review-actions";if(!r.approved){const ap=document.createElement("button");ap.type="button";ap.textContent="نشر";ap.addEventListener("click",async()=>{await supabaseClient.from(r._site?"site_reviews":"reviews").update({approved:true}).eq("id",r.id);loadReviews();refreshV11Dashboard();});acts.appendChild(ap)}const del=document.createElement("button");del.type="button";del.className="danger";del.textContent="حذف";del.addEventListener("click",async()=>{if(confirm("حذف التقييم؟")){await supabaseClient.from(r._site?"site_reviews":"reviews").delete().eq("id",r.id);loadReviews();refreshV11Dashboard();}});acts.appendChild(del);row.append(acts);root.appendChild(row)});}
$("reviewFilter")?.addEventListener("change",renderReviews);$("refreshReviewsBtn")?.addEventListener("click",loadReviews);

async function resetAdminData(){
    const btn=$("resetAdminDataBtn");
    const st=$("resetAdminDataStatus");
    if(!btn || !st) return;

    if(!confirm("تأكيد: سيتم حذف الطلبات والكوبونات فقط. التقييمات والمنتجات والمخزون والإعدادات لن يتم لمسها. هل تريد المتابعة؟")) return;
    if(!confirm("تأكيد أخير ⚠️: الحذف سيكون من Supabase نهائيًا ولا يمكن التراجع عنه. اضغط موافق للتنفيذ.")) return;

    const originalText=btn.textContent;
    btn.disabled=true;
    btn.textContent="جاري التصفير...";
    status(st,"جاري الاتصال بـ Supabase والتحقق من البيانات...","ok");

    const tables=["orders","coupons"];
    const before={};

    try{
        // Read counts first. This also proves that the current admin session can read the tables.
        for(const table of tables){
            const r=await supabaseClient.from(table).select("id",{count:"exact",head:true});
            if(r.error) throw new Error(`تعذر الوصول إلى جدول ${table}: ${r.error.message||r.error}`);
            before[table]=Number(r.count||0);
        }

        const deleted=[];
        for(const table of tables){
            if(before[table]===0){ deleted.push(`${table}: لا توجد بيانات`); continue; }

            // Fetch IDs, then delete by ID in batches. This avoids relying on a special filter
            // and lets us report exactly where Supabase/RLS blocks the operation.
            const q=await supabaseClient.from(table).select("id");
            if(q.error) throw new Error(`تعذر قراءة سجلات ${table}: ${q.error.message||q.error}`);
            const ids=(q.data||[]).map(x=>x.id).filter(x=>x!==null && x!==undefined);
            if(!ids.length) { deleted.push(`${table}: 0`); continue; }

            for(let i=0;i<ids.length;i+=100){
                const chunk=ids.slice(i,i+100);
                const r=await supabaseClient.from(table).delete().in("id",chunk);
                if(r.error){
                    throw new Error(`رفض Supabase حذف ${table}: ${r.error.message||r.error}`);
                }
            }
            deleted.push(`${table}: ${ids.length}`);
        }

        // Verify the actual database state. Never show success unless all three are really zero.
        const after={};
        for(const table of tables){
            const r=await supabaseClient.from(table).select("id",{count:"exact",head:true});
            if(r.error) throw new Error(`تم الحذف لكن تعذر التحقق من ${table}: ${r.error.message||r.error}`);
            after[table]=Number(r.count||0);
        }

        const failed=tables.filter(t=>after[t]!==0);
        if(failed.length){
            throw new Error(`التصفير لم يكتمل. الجداول التي ما زالت تحتوي بيانات: ${failed.join(", ")}. قبل: ${JSON.stringify(before)} — بعد: ${JSON.stringify(after)}`);
        }

        status(st,"تم التصفير فعليًا من Supabase ✅ الطلبات والكوبونات أصبحت 0. التقييمات والمنتجات والمخزون والإعدادات لم يتم لمسها.","ok");
        console.info("Admin reset completed",{before,after,deleted});

        // Refresh every affected admin view/stat immediately.
        const refreshes=[];
        if(typeof loadOrders==='function') refreshes.push(loadOrders());
        if(typeof loadCoupons==='function') refreshes.push(loadCoupons());
        if(typeof loadReviews==='function') refreshes.push(loadReviews());
        if(typeof loadInvoices==='function') refreshes.push(loadInvoices());
        if(typeof refreshV11Dashboard==='function') refreshes.push(refreshV11Dashboard());
        await Promise.allSettled(refreshes);
    }catch(e){
        console.error("Admin reset failed",e);
        const msg=String(e?.message||e);
        status(st,`❌ لم يتم التصفير: ${msg}<br><small>لم يتم لمس المنتجات أو المخزون أو إعدادات الموقع.</small>` ,"err");
    }finally{
        btn.disabled=false;
        btn.textContent=originalText;
    }
}
async function loadSettings(){try{const {data,error}=await supabaseClient.from("site_settings").select("key,value");if(error)throw error;v11Settings=Object.fromEntries((data||[]).map(x=>[x.key,x.value]));[["settingStoreName","store_name"],["settingWhatsapp","whatsapp"],["settingFreeShipping","free_shipping_threshold"],["settingAnnouncement","announcement"],["settingInstagram","instagram"],["settingFacebook","facebook"],["settingWhatsappMessage","whatsapp_order_message"]].forEach(([id,key])=>{if($(id))$(id).value=v11Settings[key]||""});}catch(e){status($("settingsStatus"),`فشل تحميل الإعدادات: ${e.message||e}`,"err")}}
async function saveSettings(){const values={store_name:$("settingStoreName").value.trim(),whatsapp:$("settingWhatsapp").value.trim().replace(/\D/g,""),free_shipping_threshold:String(Math.max(0,Number($("settingFreeShipping").value||0))),announcement:$("settingAnnouncement").value.trim(),instagram:$("settingInstagram").value.trim(),facebook:$("settingFacebook").value.trim()};try{for(const [key,value] of Object.entries(values)){const {error}=await supabaseClient.from("site_settings").upsert({key,value,updated_at:new Date().toISOString()},{onConflict:"key"});if(error)throw error}status($("settingsStatus"),"تم حفظ إعدادات الموقع 💾","ok");}catch(e){status($("settingsStatus"),`فشل حفظ الإعدادات: ${e.message||e}`,"err")}}
$("saveSettingsBtn")?.addEventListener("click",saveSettings);

async function refreshV11Dashboard(){
 try{
   const [ordersR, productsR, couponsR, reviewsR]=await Promise.all([
     supabaseClient.from("orders").select("id,total,status,customer_name,created_at"),
     supabaseClient.from("products").select("id,title,stock"),
     supabaseClient.from("coupons").select("id,active"),
     supabaseClient.from("reviews").select("id,approved")
   ]);
   const orders=ordersR.data||[], products=productsR.data||[], coupons=couponsR.data||[], reviews=reviewsR.data||[];
   const sales=orders.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+Number(o.total||0),0), customers=new Set(orders.map(o=>(o.customer_name||"").trim().toLowerCase()).filter(Boolean)).size;
   if($("v11Sales"))$("v11Sales").textContent=v11Money(sales);if($("v11Orders"))$("v11Orders").textContent=orders.length.toLocaleString("ar-EG");if($("v11Customers"))$("v11Customers").textContent=customers.toLocaleString("ar-EG");if($("v11LowStock"))$("v11LowStock").textContent=products.filter(p=>Number(p.stock||0)<=5).length.toLocaleString("ar-EG");if($("v11PendingReviews"))$("v11PendingReviews").textContent=reviews.filter(r=>!r.approved).length.toLocaleString("ar-EG");if($("v11Coupons"))$("v11Coupons").textContent=coupons.filter(c=>c.active).length.toLocaleString("ar-EG");
   const chart=$("salesChart");if(chart){chart.textContent="";const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push(d)}const vals=days.map(d=>orders.filter(o=>o.status!=="cancelled"&&new Date(o.created_at)>=d&&new Date(o.created_at)<new Date(d.getTime()+86400000)).reduce((s,o)=>s+Number(o.total||0),0));const max=Math.max(...vals,1);vals.forEach((v,i)=>{const b=document.createElement("div");b.className="sales-bar";b.innerHTML=`<b>${Math.round(v)}</b><i style="height:${Math.max(4,v/max*150)}px"></i><small>${days[i].toLocaleDateString("ar-EG",{weekday:"short"})}</small>`;chart.appendChild(b)})}
   const top=$("topProductsList");if(top){top.textContent="";const counts={};orders.forEach(o=>(Array.isArray(o.items)?o.items:[]).forEach(it=>{const k=String(it.id||it.name);counts[k]??={name:it.name||"منتج",qty:0};counts[k].qty+=Number(it.quantity||1)}));Object.values(counts).sort((a,b)=>b.qty-a.qty).slice(0,5).forEach(x=>{const r=document.createElement("div");r.className="top-product";r.innerHTML=`<b>${x.name}</b><span class="v8-badge">${x.qty} قطعة</span>`;top.appendChild(r)});if(!top.children.length)top.innerHTML='<div class="muted-v11">لا توجد مبيعات كافية بعد.</div>'}
 }catch(e){console.warn("Dashboard unavailable",e)}
}

async function printInvoice(order){
 const items=Array.isArray(order.items)?order.items:[];const rows=items.map(i=>`<tr><td>${i.name||"منتج"}</td><td>${i.quantity||1}</td><td>${v11Money(i.price)}</td><td>${v11Money((Number(i.price)||0)*(Number(i.quantity)||1))}</td></tr>`).join("");
 const w=window.open("","_blank","width=800,height=900");if(!w)return;w.document.write(`<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>فاتورة #${order.id}</title><style>body{font-family:Arial;padding:40px;color:#222}h1{margin-bottom:5px}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:right}.total{font-size:22px;font-weight:bold;margin-top:25px}</style></head><body><h1>D&L ACC</h1><p>فاتورة الطلب #${order.id}</p><p>العميل: ${order.customer_name||"—"}<br>الموبايل: ${order.phone||"—"}<br>العنوان: ${order.address||"—"}</p><table><thead><tr><th>المنتج</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${rows}</tbody></table><div class="total">الإجمالي: ${v11Money(order.total)}</div><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}

// Add invoice action to the existing order details modal.
const oldOpenOrderDetails=openOrderDetails;openOrderDetails=function(order){oldOpenOrderDetails(order);setTimeout(()=>{const c=$("orderDetailContent");if(c&&!c.querySelector(".v11-invoice-btn")){const b=document.createElement("button");b.type="button";b.className="v11-invoice-btn";b.textContent="🧾 طباعة الفاتورة";b.addEventListener("click",()=>printInvoice(order));c.appendChild(b)}},30)};


async function loadInvoices(){const root=$("invoicesList");if(!root)return;try{const {data,error}=await supabaseClient.from("orders").select("id,customer_name,phone,address,items,total,status,created_at,coupon_code,coupon_discount").order("created_at",{ascending:false});if(error)throw error;window.v11InvoiceOrders=data||[];renderInvoices();status($("invoicesStatus"),`تم تحميل ${window.v11InvoiceOrders.length} فاتورة.` ,"ok");}catch(e){status($("invoicesStatus"),`فشل تحميل الفواتير: ${e.message||e}`,"err")}}
function renderInvoices(){const root=$("invoicesList");if(!root)return;root.textContent="";const q=($("invoiceSearch")?.value||"").toLowerCase();const rows=(window.v11InvoiceOrders||[]).filter(o=>`${o.id} ${o.customer_name||""}`.toLowerCase().includes(q));if(!rows.length){root.innerHTML='<div class="muted-v11">لا توجد فواتير مطابقة.</div>';return}rows.forEach(o=>{const row=document.createElement("div");row.className="coupon-row";row.innerHTML=`<div><b>فاتورة #${o.id}</b><div class="muted-v11">${o.customer_name||"—"} • ${o.phone||"—"} • ${v11Money(o.total)} • ${v11Date(o.created_at)}</div></div>`;const b=document.createElement("button");b.type="button";b.className="v11-invoice-btn";b.textContent="طباعة 🧾";b.addEventListener("click",()=>printInvoice(o));row.appendChild(b);root.appendChild(row)});}
$("invoiceSearch")?.addEventListener("input",renderInvoices);$("refreshInvoicesBtn")?.addEventListener("click",loadInvoices);

async function loadV11All(){await loadProductsV11();await loadCoupons();await loadReviews();await loadSettings();await loadInvoices();await refreshV11Dashboard();}
// Extend tab navigation with V11 panels.
document.querySelectorAll('.admin-tab').forEach(tab=>{tab.addEventListener('click',()=>{const t=tab.dataset.tab;if(t==='dashboardPanel')refreshV11Dashboard();if(t==='inventoryPanel')renderInventory();if(t==='offersPanel'){loadProductsV11();loadProductsV11();}if(t==='couponsPanel')loadCoupons();if(t==='reviewsPanel')loadReviews();if(t==='settingsPanel')loadSettings();if(t==='invoicesPanel')loadInvoices();});});
$("refreshDashboardBtn")?.addEventListener("click",refreshV11Dashboard);

checkSession();
setTimeout(loadV11All,900);



/* V12 runtime guard: keeps browser errors visible without breaking the page UI. */
window.addEventListener('unhandledrejection', function (event) {
  console.warn('D&L ACC async error:', event.reason);
});
window.addEventListener('error', function (event) {
  console.warn('D&L ACC browser error:', event.message);
});

$("resetAdminDataBtn")?.addEventListener("click",resetAdminData);
