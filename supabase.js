// =============================================
// SUPABASE CLIENT + API WRAPPER
// =============================================
// Cấu hình: thay YOUR_SUPABASE_URL và YOUR_SUPABASE_ANON_KEY
// bằng giá trị từ Supabase Dashboard > Settings > API

const SUPABASE_URL = 'https://eshqpllxveckyguemkbh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzaHFwbGx4dmVja3lndWVta2JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4OTMxNTgsImV4cCI6MjA5MTQ2OTE1OH0.kEYh9AZrYkZiZFO7kv3C59xv5JHK_fIz-ctCF_RT1mE'

let _supabase = null;
let _currentShopId = null;
let _currentUser = null;
let _currentRole = null;

function getSupabase() {
    if (!_supabase) {
        _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return _supabase;
}

// =============================================
// AUTH
// =============================================

async function signUp(email, password, shopName) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    const user = data.user;

    const { data: shop, error: shopErr } = await sb.from('shops').insert({ name: shopName || 'Quán mới' }).select().single();
    if (shopErr) throw shopErr;

    const { error: memberErr } = await sb.from('shop_members').insert({ shop_id: shop.id, user_id: user.id, role: 'owner' });
    if (memberErr) throw memberErr;

    _currentUser = user;
    _currentShopId = shop.id;
    _currentRole = 'owner';
    return { user, shop };
}

async function signIn(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    _currentUser = data.user;
    await loadUserShop();
    return data;
}

async function signOut() {
    const sb = getSupabase();
    await sb.auth.signOut();
    _currentUser = null;
    _currentShopId = null;
    _currentRole = null;
}

async function getSession() {
    const sb = getSupabase();
    const { data } = await sb.auth.getSession();
    return data.session;
}

async function loadUserShop() {
    const sb = getSupabase();
    const { data: members, error } = await sb.from('shop_members')
        .select('shop_id, role, shops(id, name, phone, address, qr_image)')
        .eq('user_id', _currentUser.id)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!members) throw new Error('Tài khoản này chưa được gán vào quán nào. Hãy đăng nhập đúng tài khoản đã tạo quán.');
    _currentShopId = members.shop_id;
    _currentRole = members.role;
    return members;
}

function requireAuth() {
    if (!_currentUser || !_currentShopId) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// =============================================
// MENU
// =============================================

async function fetchMenu() {
    const sb = getSupabase();
    const { data, error } = await sb.from('menu_items')
        .select('*')
        .eq('shop_id', _currentShopId)
        .order('sort_order', { ascending: true });
    if (error) throw error;
    return data;
}

async function upsertMenuItem(item) {
    const sb = getSupabase();
    const row = { ...item, shop_id: _currentShopId };
    if (row.id) {
        const { data, error } = await sb.from('menu_items').update(row).eq('id', row.id).select().single();
        if (error) throw error;
        return data;
    } else {
        delete row.id;
        const { data, error } = await sb.from('menu_items').insert(row).select().single();
        if (error) throw error;
        return data;
    }
}

async function deleteMenuItem(id) {
    const sb = getSupabase();
    const { error } = await sb.from('menu_items').delete().eq('id', id);
    if (error) throw error;
}

async function updateMenuOrder(items) {
    const sb = getSupabase();
    const updates = items.map((item, i) => ({ id: item.id, sort_order: i, shop_id: _currentShopId }));
    const { error } = await sb.from('menu_items').upsert(updates, { onConflict: 'id' });
    if (error) throw error;
}

// =============================================
// ORDERS
// =============================================

async function fetchOrders(statusFilter) {
    const sb = getSupabase();
    let q = sb.from('orders')
        .select('*, order_items(*)')
        .eq('shop_id', _currentShopId)
        .order('created_at', { ascending: false });
    if (statusFilter !== undefined) {
        q = q.eq('status', statusFilter);
    }
    const { data, error } = await q;
    if (error) throw error;
    return data;
}

async function createOrder(tableNumber, items) {
    const sb = getSupabase();
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);

    const existingQ = await sb.from('orders')
        .select('id, total')
        .eq('shop_id', _currentShopId)
        .eq('table_number', tableNumber)
        .eq('status', 0)
        .limit(1)
        .maybeSingle();

    if (existingQ.data) {
        const order = existingQ.data;
        await sb.from('orders').update({ total: order.total + total, updated_at: new Date().toISOString() }).eq('id', order.id);
        const orderItems = items.map(i => ({ order_id: order.id, name: i.name, qty: i.qty, price: i.price, note: i.note || '' }));
        await sb.from('order_items').insert(orderItems);
        return { ...order, merged: true };
    }

    const { data: order, error } = await sb.from('orders')
        .insert({ shop_id: _currentShopId, table_number: tableNumber, total, status: 0, paid: false })
        .select()
        .single();
    if (error) throw error;

    const orderItems = items.map(i => ({ order_id: order.id, name: i.name, qty: i.qty, price: i.price, note: i.note || '' }));
    await sb.from('order_items').insert(orderItems);

    return order;
}

async function updateOrderStatus(orderId, status) {
    const sb = getSupabase();
    const { error } = await sb.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) throw error;
}

async function updateOrderPaid(orderId, paid) {
    const sb = getSupabase();
    const { error } = await sb.from('orders').update({ paid, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) throw error;
}

async function deleteOrder(orderId) {
    const sb = getSupabase();
    const { error } = await sb.from('orders').delete().eq('id', orderId);
    if (error) throw error;
}

// =============================================
// SHOP SETTINGS
// =============================================

async function fetchShop() {
    const sb = getSupabase();
    const { data, error } = await sb.from('shops').select('*').eq('id', _currentShopId).single();
    if (error) throw error;
    return data;
}

async function updateShop(updates) {
    const sb = getSupabase();
    const { error } = await sb.from('shops').update(updates).eq('id', _currentShopId);
    if (error) throw error;
}

// =============================================
// REALTIME SUBSCRIPTIONS
// =============================================

function subscribeOrders(callback) {
    const sb = getSupabase();
    return sb.channel('orders-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `shop_id=eq.${_currentShopId}`
        }, callback)
        .subscribe();
}

function subscribeOrderItems(callback) {
    const sb = getSupabase();
    return sb.channel('order-items-realtime')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'order_items'
        }, callback)
        .subscribe();
}

// =============================================
// STATS
// =============================================

async function fetchStats() {
    const sb = getSupabase();
    const { data, error } = await sb.from('orders')
        .select('total, status, paid, created_at, order_items(name, qty)')
        .eq('shop_id', _currentShopId)
        .eq('status', 1);
    if (error) throw error;
    return data;
}

// =============================================
// STAFF MANAGEMENT
// =============================================

async function addStaff(email, role) {
    const sb = getSupabase();
    const { data: users } = await sb.from('auth.users').select('id').eq('email', email).single();
    if (!users) throw new Error('User not found. They must sign up first.');
    const { error } = await sb.from('shop_members').insert({ shop_id: _currentShopId, user_id: users.id, role });
    if (error) throw error;
}

async function fetchMembers() {
    const sb = getSupabase();
    const { data, error } = await sb.from('shop_members')
        .select('id, role, user_id')
        .eq('shop_id', _currentShopId);
    if (error) throw error;
    return data;
}
