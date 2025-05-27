/* =====================================================================
   cart-script.js  –  WooCommerce Store API + JWT + AJAX
   ===================================================================== */

/* ---------- evitar doble carga ---------- */
(function(){
  if (window.__LAPACHO_CART_LOADED__) {
    console.warn("cart-script.js ya estaba cargado, se ignora duplicado");
    return;   // ahora es válido, está dentro de función IIFE
  }
  window.__LAPACHO_CART_LOADED__ = true;

  // TODO tu código aquí, sin cambios
  const BASE_URL = "http://lapacho-1.local";

  // resto del script ...
})();


/* ---------- configuración ---------- */
const BASE_URL = "http://lapacho-1.local";   // ← tu dominio WordPress/Woo

/* =====================================================================
   1.  JWT helpers (los que ya usás en otras páginas)
   ===================================================================== */
   let productsAlreadyLoaded = false;
   // decodifica la parte intermedia del JWT (payload) sin bibliotecas externas
   function decodeJwtPayload (token) {
     const payloadBase64 = token.split('.')[1];
     // Base64url → Base64 estándar
     const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
     const json = atob(base64);
     return JSON.parse(json);
   }
   
   function isTokenValid (token) {
     if (!token) return false;
     try {
       const { exp } = decodeJwtPayload(token);     // fecha Unix (segundos)
       const now = Date.now() / 1000;               // a segundos
       return exp && exp - now > 60;                // 1 min de margen
     } catch (_) {
       return false;
     }
   }
   
   /* ---------- obtener token (cache + renovación) ---------- */
   
   async function fetchNewToken () {
     console.log('🔄 Pidiendo token nuevo…');
     const res = await fetch('http://lapacho-1.local/wp-content/get-jwt-token.php');
     if (!res.ok) throw new Error('No se pudo obtener token');
     return (await res.text()).trim();
   }
   
   async function getToken () {
     const saved = localStorage.getItem('lapacho_jwt');
     if (isTokenValid(saved)) {
       // reutilizamos token en cache
       return saved;
     }
   
     // venció o no existe → pedimos uno nuevo y lo guardamos
     const fresh = await fetchNewToken();
     localStorage.setItem('lapacho_jwt', fresh);
     return fresh;
   }
   

/* =====================================================================
   2.  Utils UI
   ===================================================================== */
const $ = (sel) => document.querySelector(sel);
function formatCurrency(n){ return "$" + n.toFixed(2).replace(".", ","); }
function showProcessing(){ $("#processing-overlay")?.style.setProperty("display","block"); }
function hideProcessing(){ $("#processing-overlay")?.style.setProperty("display","none"); }
function showCartMessage(msg){
  const box = $("#cart-message");
  if(!box){ alert(msg); return; }
  box.textContent = msg;
  box.style.display = "block";
  box.style.opacity = "1";
  setTimeout(()=>{ box.style.opacity = "0";
    setTimeout(()=>{ box.style.display="none"; box.style.opacity="1"; },300);
  },3000);
}

/* =====================================================================
   3.  fetchJSON → adjunta token automáticamente
   ===================================================================== */
async function fetchJSON(url, opts={}) {
  const headers = new Headers(opts.headers || {});
  try {
    const token = await getToken();               // puede lanzar
    if (token) headers.set("Authorization", `Bearer ${token}`);
  } catch (e) {
    console.warn("No se pudo obtener token:", e);
  }
  opts.headers      = headers;
  opts.credentials  = opts.credentials || "include";

  const res  = await fetch(url, opts);
  const txt  = await res.text();
  const cTyp = res.headers.get("content-type") || "";

  if (!cTyp.includes("application/json")) {
    console.error(`⛔ ${url} devolvió algo que NO es JSON:\n`, txt.slice(0,500));
    throw new SyntaxError("Respuesta no-JSON");
  }
  return JSON.parse(txt);
}

/* =====================================================================
   4.  Contador del carrito
   ===================================================================== */
async function updateCartCount(){
  try {
    const cart = await fetchJSON(`${BASE_URL}/wp-json/wc/store/cart`);
    $("#cart-count").textContent = cart.items_count ?? 0;
  } catch (e) { console.error("updateCartCount:", e); }
}

/* =====================================================================
   5.  Renderizar carrito
   ===================================================================== */
async function renderCart(){
  try{
    const cart = await fetchJSON(`${BASE_URL}/wp-json/wc/store/cart`);

    if(!cart.items?.length){
      $("#cart-container").innerHTML = `
        <div class="empty-cart">
          <i class="fas fa-shopping-cart"></i>
          <h3>Tu carrito está vacío</h3>
          <p>Parece que aún no has agregado productos.</p>
          <a href="products indumentaria.html" class="checkout-btn">Explorar productos</a>
        </div>`;
      $("#cart-summary-section").style.display = "none";
      $("#clear-cart-btn").style.display       = "none";
      return;
    }

    let html = `<table class="table cart-items-table">
      <thead><tr><th>Producto</th><th>Precio</th><th>Cant.</th><th>Subtotal</th><th></th></tr></thead><tbody>`;
    let subtotal = 0;

    cart.items.forEach(it=>{
      const price     = it.prices.price/100;
      const lineTotal = it.totals.line_subtotal ? it.totals.line_subtotal/100 : price*it.quantity;
      subtotal       += lineTotal;
      const img       = it.images?.length ? `<img src="${it.images[0].src}" alt="${it.name}" class="cart-product-image">` : "";

      html += `<tr>
        <td><div class="d-flex align-items-center">${img}<span class="item-name ml-3">${it.name}</span></div></td>
        <td>${formatCurrency(price)}</td>
        <td>
          <div class="quantity-control">
            <button class="qty-btn decrease" onclick="updateQuantity('${it.key}',${it.quantity-1})"><i class="fas fa-minus"></i></button>
            <span class="mx-2">${it.quantity}</span>
            <button class="qty-btn increase" onclick="addToCart(${it.id},1)"><i class="fas fa-plus"></i></button>
          </div>
        </td>
        <td>${formatCurrency(lineTotal)}</td>
        <td><button class="remove-item-btn" onclick="removeItem('${it.key}')"><i class="fas fa-trash-alt"></i></button></td>
      </tr>`;
    });

    html += "</tbody></table>";
    $("#cart-container").innerHTML           = html;
    $("#cart-summary-section").style.display = "flex";
    $("#cart-subtotal").textContent          = formatCurrency(subtotal);
    $("#cart-total").textContent             = formatCurrency(subtotal);
    $("#clear-cart-btn").style.display       = "block";

  }catch(e){
    console.error("renderCart:", e);
    $("#cart-container").innerHTML = "<p class='text-center'>Hubo un error al cargar tu carrito (mirá consola).</p>";
  }
}

/* =====================================================================
   6.  Acciones (add, update, remove, clear)
   ===================================================================== */
async function addToCart(id, qty=1){
  showProcessing();
  try{
    await fetch(`${BASE_URL}/?wc-ajax=add_to_cart`,{
      method:"POST",credentials:"include",
      headers:{"Content-Type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({product_id:id, quantity:qty})
    });
    showCartMessage("Producto agregado al carrito");
    await renderCart(); await updateCartCount();
  }catch(e){ console.error("addToCart:", e); showCartMessage("❌ Error al agregar"); }
  finally{ hideProcessing(); }
}

async function updateQuantity(key, qty){
  if(!key) return;
  if(qty<1) return removeItem(key);
  showProcessing();
  try{
    const fd=new FormData();
    fd.append("action","woocommerce_update_cart_item");
    fd.append("cart_item_key",key);
    fd.append("quantity",qty);
    const r = await fetch(`${BASE_URL}/wp-admin/admin-ajax.php`,{method:"POST",credentials:"include",body:fd});
    const data = await r.json();
    if(!data?.success) throw new Error("Respuesta inesperada");
    await renderCart(); await updateCartCount();
  }catch(e){ console.error("updateQuantity:",e); showCartMessage("❌ Error al actualizar"); }
  finally{ hideProcessing(); }
}

async function removeItem(key){
  if(!key) return;
  showProcessing();
  try{
    const fd=new FormData();
    fd.append("action","remove_item");
    fd.append("item_key",key);
    await fetch(`${BASE_URL}/wp-admin/admin-ajax.php`,{method:"POST",credentials:"include",body:fd});
    showCartMessage("Producto eliminado");
    await renderCart(); await updateCartCount();
  }catch(e){ console.error("removeItem:",e); showCartMessage("❌ Error al eliminar"); }
  finally{ hideProcessing(); }
}

async function clearCart(){
  showProcessing();
  try{
    const fd=new FormData(); fd.append("action","clear_cart");
    await fetch(`${BASE_URL}/wp-admin/admin-ajax.php`,{method:"POST",credentials:"include",body:fd});
    showCartMessage("Carrito vaciado");
    await renderCart(); await updateCartCount();
  }catch(e){ console.error("clearCart:",e); showCartMessage("❌ Error al vaciar"); }
  finally{ hideProcessing(); }
}

/* =====================================================================
   7.  Barra fija al hacer scroll
   ===================================================================== */
window.addEventListener("scroll",()=>{
  const topbar = document.querySelector(".topbar.bg-color11");
  if(topbar) window.scrollY>100 ? topbar.classList.add("fixed") : topbar.classList.remove("fixed");
});

/* =====================================================================
   8.  Inicio
   ===================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  updateCartCount();
  renderCart();
  $("#clear-cart-btn")?.addEventListener("click", clearCart);
});
async function fetchCart() {
  try {
    const response = await fetch('/wp-admin/admin-ajax.php?action=get_cart_items', {
      credentials: 'include'
    });
    const data = await response.json();

    if (!data.success) {
      console.error('Error al obtener carrito:', data.data);
      return;
    }

    const cart = data.data;
    const container = document.getElementById('cart-container');
    if (!container) return;

    if (cart.items_count === 0) {
      container.innerHTML = '<p>Tu carrito está vacío.</p>';
      return;
    }

    let html = `
      <table class="cart-table" style="width: 100%; border-collapse: collapse;">
        <thead style="background-color: #c39a58; color: white;">
          <tr>
            <th style="padding: 10px; text-align: left;">PRODUCTO</th>
            <th style="padding: 10px; text-align: right;">PRECIO</th>
            <th style="padding: 10px; text-align: center;">CANTIDAD</th>
            <th style="padding: 10px; text-align: right;">SUBTOTAL</th>
            <th style="padding: 10px; text-align: center;">ELIMINAR</th>
          </tr>
        </thead>
        <tbody>
    `;

    cart.items.forEach(item => {
      html += `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; display: flex; align-items: center;">
            <img src="${item.image}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; margin-right: 15px;" />
            <span>${item.name}</span>
          </td>
          <td style="padding: 10px; text-align: right;">$${item.price.toFixed(2).replace('.', ',')}</td>
          <td style="padding: 10px; text-align: center;">
            <button onclick="updateQuantity('${item.key}', ${item.quantity - 1})" style="padding: 5px 10px; margin-right: 5px;">-</button>
            ${item.quantity}
            <button onclick="updateQuantity('${item.key}', ${item.quantity + 1})" style="padding: 5px 10px; margin-left: 5px;">+</button>
          </td>
          <td style="padding: 10px; text-align: right;">$${item.subtotal.toFixed(2).replace('.', ',')}</td>
          <td style="padding: 10px; text-align: center;">
            <button onclick="removeItem('${item.key}')" style="color: red; border: none; background: none; cursor: pointer;">&#10005;</button>
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
      <p style="text-align: right; margin-top: 20px; font-weight: bold;">Total: $${parseFloat(cart.total.replace(',', '.')).toFixed(2).replace('.', ',')}</p>
    `;

    container.innerHTML = html;

  } catch (error) {
    console.error('Error fetchCart:', error);
  }
}

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  fetchCart();
});
