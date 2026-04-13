-- =============================================
-- SUMO QUÁN - Multi-tenant Schema for Supabase
-- Safe to re-run in SQL Editor
-- =============================================

-- Extensions
create extension if not exists pgcrypto;

-- Tables
create table if not exists shops (
    id uuid default gen_random_uuid() primary key,
    name text not null default 'Quán mới',
    phone text,
    address text,
    qr_image text,
    created_at timestamptz default now()
);

create table if not exists shop_members (
    id uuid default gen_random_uuid() primary key,
    shop_id uuid references shops(id) on delete cascade not null,
    user_id uuid references auth.users(id) on delete cascade not null,
    role text not null default 'staff' check (role in ('owner', 'staff', 'kitchen')),
    created_at timestamptz default now(),
    unique(shop_id, user_id)
);

create table if not exists menu_items (
    id uuid default gen_random_uuid() primary key,
    shop_id uuid references shops(id) on delete cascade not null,
    name text not null,
    price integer not null default 0,
    emoji text default '🍜',
    note text default '',
    highlight boolean default false,
    sort_order integer default 0,
    created_at timestamptz default now()
);

create table if not exists orders (
    id uuid default gen_random_uuid() primary key,
    shop_id uuid references shops(id) on delete cascade not null,
    table_number text not null,
    total integer not null default 0,
    status integer not null default 0,
    paid boolean default false,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create table if not exists order_items (
    id uuid default gen_random_uuid() primary key,
    order_id uuid references orders(id) on delete cascade not null,
    name text not null,
    qty integer not null default 1,
    price integer not null default 0,
    note text default '',
    created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_shop_members_user on shop_members(user_id);
create index if not exists idx_shop_members_shop on shop_members(shop_id);
create index if not exists idx_menu_items_shop on menu_items(shop_id);
create index if not exists idx_orders_shop on orders(shop_id);
create index if not exists idx_orders_status on orders(shop_id, status);
create index if not exists idx_order_items_order on order_items(order_id);

-- RLS
alter table shops enable row level security;
alter table shop_members enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;

-- Helper functions that MUST bypass RLS to prevent infinite recursion
create or replace function get_user_shop_ids()
returns setof uuid as $$
    select shop_id from shop_members where user_id = auth.uid()
$$ language sql security definer stable set search_path = public;

create or replace function is_shop_owner(check_shop_id uuid)
returns boolean as $$
    select exists (
        select 1 from shop_members
        where shop_id = check_shop_id and user_id = auth.uid() and role = 'owner'
    )
$$ language sql security definer stable set search_path = public;

-- Drop old policies safely
DROP POLICY IF EXISTS "Users see own shops" ON shops;
DROP POLICY IF EXISTS "Authenticated users can create shop" ON shops;
DROP POLICY IF EXISTS "Owner can update shop" ON shops;
DROP POLICY IF EXISTS "See members of own shop" ON shop_members;
DROP POLICY IF EXISTS "User can create own owner membership" ON shop_members;
DROP POLICY IF EXISTS "Owner can insert members" ON shop_members;
DROP POLICY IF EXISTS "Owner can update members" ON shop_members;
DROP POLICY IF EXISTS "Owner can delete members" ON shop_members;
DROP POLICY IF EXISTS "Owner manages members" ON shop_members;
DROP POLICY IF EXISTS "See menu of own shop" ON menu_items;
DROP POLICY IF EXISTS "Owner/staff insert menu" ON menu_items;
DROP POLICY IF EXISTS "Owner/staff update menu" ON menu_items;
DROP POLICY IF EXISTS "Owner/staff delete menu" ON menu_items;
DROP POLICY IF EXISTS "Owner/staff manage menu" ON menu_items;
DROP POLICY IF EXISTS "See orders of own shop" ON orders;
DROP POLICY IF EXISTS "Staff insert orders" ON orders;
DROP POLICY IF EXISTS "Staff update orders" ON orders;
DROP POLICY IF EXISTS "Staff delete orders" ON orders;
DROP POLICY IF EXISTS "Staff manage orders" ON orders;
DROP POLICY IF EXISTS "See order items of own shop" ON order_items;
DROP POLICY IF EXISTS "Staff insert order items" ON order_items;
DROP POLICY IF EXISTS "Staff update order items" ON order_items;
DROP POLICY IF EXISTS "Staff delete order items" ON order_items;
DROP POLICY IF EXISTS "Staff manage order items" ON order_items;

-- Shops policies
create policy "Users see own shops" on shops
    for select using (id in (select get_user_shop_ids()));

create policy "Authenticated users can create shop" on shops
    for insert with check (auth.uid() is not null);

create policy "Owner can update shop" on shops
    for update using (is_shop_owner(id))
    with check (is_shop_owner(id));

-- Shop member policies
create policy "See members of own shop" on shop_members
    for select using (shop_id in (select get_user_shop_ids()));

create policy "User can create own owner membership" on shop_members
    for insert with check (user_id = auth.uid() and role = 'owner');

create policy "Owner can insert members" on shop_members
    for insert with check (is_shop_owner(shop_id));

create policy "Owner can update members" on shop_members
    for update using (is_shop_owner(shop_id))
    with check (is_shop_owner(shop_id));

create policy "Owner can delete members" on shop_members
    for delete using (is_shop_owner(shop_id));

-- Menu policies
create policy "See menu of own shop" on menu_items
    for select using (shop_id in (select get_user_shop_ids()));

create policy "Owner/staff insert menu" on menu_items
    for insert with check (shop_id in (select get_user_shop_ids()));

create policy "Owner/staff update menu" on menu_items
    for update using (
        shop_id in (
            select shop_id from shop_members where user_id = auth.uid() and role in ('owner', 'staff')
        )
    )
    with check (
        shop_id in (
            select shop_id from shop_members where user_id = auth.uid() and role in ('owner', 'staff')
        )
    );

create policy "Owner/staff delete menu" on menu_items
    for delete using (
        shop_id in (
            select shop_id from shop_members where user_id = auth.uid() and role in ('owner', 'staff')
        )
    );

-- Orders policies
create policy "See orders of own shop" on orders
    for select using (shop_id in (select get_user_shop_ids()));

create policy "Staff insert orders" on orders
    for insert with check (shop_id in (select get_user_shop_ids()));

create policy "Staff update orders" on orders
    for update using (shop_id in (select get_user_shop_ids()))
    with check (shop_id in (select get_user_shop_ids()));

create policy "Staff delete orders" on orders
    for delete using (shop_id in (select get_user_shop_ids()));

-- Order items policies
create policy "See order items of own shop" on order_items
    for select using (
        order_id in (select id from orders where shop_id in (select get_user_shop_ids()))
    );

create policy "Staff insert order items" on order_items
    for insert with check (
        order_id in (select id from orders where shop_id in (select get_user_shop_ids()))
    );

create policy "Staff update order items" on order_items
    for update using (
        order_id in (select id from orders where shop_id in (select get_user_shop_ids()))
    )
    with check (
        order_id in (select id from orders where shop_id in (select get_user_shop_ids()))
    );

create policy "Staff delete order items" on order_items
    for delete using (
        order_id in (select id from orders where shop_id in (select get_user_shop_ids()))
    );

-- Realtime
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE orders;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE order_items;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
