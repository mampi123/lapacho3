
/* ---------- helpers ---------- */
// ► se marca en true después de la primera carga correcta
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

/* ---------- ejemplo: pedir productos ---------- */

async function getProducts ({ forceReload = false } = {}) {

  /* si ya los cargamos y no estamos forzando recarga,
     sencillamente salimos sin mostrar loader */
  if (productsAlreadyLoaded && !forceReload) return;

  const loadingElem = document.querySelector(".loading-state");
  const emptyElem   = document.querySelector(".empty-state");

  // loader solo la PRIMERA vez o si se fuerza recarga
  if (loadingElem) loadingElem.style.display = "block";
  if (emptyElem)   emptyElem.style.display   = "none";
  const token = await getToken();
  console.log('🐻‍❄ Token usado:', token);

  const res = await fetch('http://lapacho-1.local/wp-json/wc/v3/products', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) throw new Error(`WooCommerce error ${res.status}`);
  const products = await res.json();
  console.log('📦 Productos', products);
}
async function getProducts() {
  // Mostrar el cartel de "Cargando productos..." y ocultar el de "No se encontraron productos"
  const loadingElem = document.querySelector('.loading-state');
  const emptyElem = document.querySelector('.empty-state');

  if (loadingElem) loadingElem.style.display = 'block';
  if (emptyElem) emptyElem.style.display = 'none';

  // Obtener el token JWT desde el backend
  const token = await getToken();
  if (!token) {
    console.error("No se pudo obtener el token");
    return;
  }

  try {
    const response = await fetch("http://lapacho-1.local/wp-json/wc/v3/products", {
      method: "GET",
      mode: "cors",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }

    const products = await response.json();
    console.log('Productos desde WooCommerce:', products); // Verificar los datos

    // Ocultamos el cartel de carga al recibir respuesta
    if (loadingElem) loadingElem.style.display = 'none';

    if (products.length === 0) {
      // Mostramos mensaje de 'No hay productos' (o tu bloque .empty-state si prefieres)
      document.getElementById("products-container").innerHTML = `<p>No hay productos disponibles.</p>`;
      if (emptyElem) emptyElem.style.display = 'block';
      return;
    }

    // 🔹 Generar HTML con control de cantidad
    let productsHTML = products.map(product => {
      // ID único para el <span> de la cantidad
      const qtyElementId = `qty-prod-${product.id}`;

      const price = parseFloat(product.price);
      const sales = product.total_sales || 0;  // Asegúrate de tener 'total_sales'
      const name = product.name;

      return `
        <div class="product" 
             data-price="${price}" 
             data-sales="${sales}" 
             data-name="${name}">
          <img 
            src="${product.images.length ? product.images[0].src : 'https://via.placeholder.com/150'}" 
            alt="${name}"
          >
          <h2 class="product-name">${name || 'Sin nombre'}</h2>
          <p>Precio: $${price.toFixed(2)}</p>
          <p>Ventas: ${sales}</p>

          <!-- Contenedor de cantidad -->
          <div class="quantity-control">
            <button class="qty-btn decrease" 
                    onclick="changeProductQty('${qtyElementId}', -1)">
              <i class="fas fa-minus"></i>
            </button>
            <span id="${qtyElementId}">1</span>
            <button class="qty-btn increase" 
                    onclick="changeProductQty('${qtyElementId}', 1)">
              <i class="fas fa-plus"></i>
            </button>
          </div>

          <!-- Botón para agregar al carrito, usando la cantidad actual -->
          <button class="cart-icon" 
                  onclick="addToCart(${product.id}, getProductQty('${qtyElementId}'))">
            <i class="fas fa-shopping-cart"></i>
          </button>
        </div>
      `;
    }).join("");

    document.getElementById("products-container").innerHTML = productsHTML;

  } catch (error) {
    console.error("❌ Error al obtener los productos:", error);
    document.getElementById("products-container").innerHTML = `<p>Error al cargar los productos. Revisa la consola.</p>`;
  } 
  finally {
    if (loadingElem) loadingElem.style.display = "none";
  }
}





async function obtenerNonceDesdeServidor() {
    try {
        const response = await fetch("http://lapacho-1.local/wp-admin/admin-ajax.php?action=obtener_nonce", {
            method: "GET",
            mode: "cors",
            headers: {
              "Authorization": `Bearer ${token}`,
            }
        });
        const data = await response.json();
        
        if (data.success && data.data.nonce) {
            console.log("✅ Nonce obtenido desde el servidor:", data.data.nonce);
            return data.data.nonce;
        } else {
            console.error("❌ No se pudo obtener el nonce.");
            return null;
        }
    } catch (error) {
        console.error("❌ Error al obtener el nonce:", error);
        return null;
    }
}


async function addToCart(productId, quantity = 1) {
    showProcessing();
    try {
      const response = await fetch("http://lapacho-1.local/?wc-ajax=add_to_cart", {
        method: "POST",
        mode: "cors",
        credentials: "include",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          product_id: productId,
          quantity: quantity
        })
      });
  
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const data = await response.json();
      console.log("Producto agregado:", data);
  
      // Agregar notificación de éxito:
      showCartMessage("Producto agregado al carrito");
  
      // Refresca el carrito y el contador
      updateCartCount();
    } catch (error) {
      console.error("Error al agregar al carrito:", error);
      showCartMessage("❌ Error al agregar al carrito");
    }
    finally {
      hideProcessing();
    }
  }

  async function updateCartCount () {
    try {
      // 1 ) consigue el JWT (del cache o lo renueva)
      const token = await getToken();           // <- misma helper usada antes
      if (!token) throw new Error("sin token");
  
      // 2 ) petición al Store API
      const res = await fetch("http://lapacho-1.local/wp-json/wc/store/cart", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        credentials: "include"   // conserva la sesión / cookies
      });
  
      if (!res.ok) throw new Error(`Woo error ${res.status}`);
      const data = await res.json();
  
      // 3 ) pinta el Nº de ítems
      const count = data.items_count ?? 0;      // null‑coalescing
      document.getElementById("cart-count").textContent = count;
  
    } catch (err) {
      console.error("❌ Error al obtener el contador de carrito:", err);
    }
  }
  

function openCartPage() {
    // Si tu página de carrito es /cart, usa:
    window.location.href = "carrito.html";
    // O cambia la URL según tu caso:
  }



  document.addEventListener("DOMContentLoaded", () => {
    updateCartCount();      // <--- Agrega esta línea
    getProducts();
    updateCartUI();
});




  window.addEventListener("scroll", function() {
    const topbar = document.querySelector(".topbar.bg-color11");
    if (!topbar) return;
  
    if (window.scrollY > 100) {
      // Si scrolleamos más de 100px, añadimos la clase "fixed"
      topbar.classList.add("fixed");
    } else {
      // Si estamos por encima de 100px, la barra vuelve a ser normal
      topbar.classList.remove("fixed");
    }
  });
  
  document.addEventListener("DOMContentLoaded", function () {
    const sortSelect = document.getElementById("sort");
    const searchInput = document.getElementById("search-input");
    const searchButton = document.getElementById("search-button");

    // Función para ordenar productos
    sortSelect.addEventListener("change", function () {
        const selectedValue = this.value;
        sortProducts(selectedValue);
    });

    // Función para buscar productos
    searchButton.addEventListener("click", function () {
        const searchTerm = searchInput.value.toLowerCase();
        filterProducts(searchTerm);
    });

    searchInput.addEventListener("keyup", function (event) {
        if (event.key === "Enter") {
            const searchTerm = searchInput.value.toLowerCase();
            filterProducts(searchTerm);
        }
    });

    function sortProducts(criteria) {
        let products = document.querySelectorAll(".product-card");
        let productsArray = Array.from(products);

        productsArray.sort((a, b) => {
            let priceA = parseFloat(a.dataset.price);
            let priceB = parseFloat(b.dataset.price);
            let salesA = parseInt(a.dataset.sales);  // Asegúrate de tener el número de ventas en cada producto
            let salesB = parseInt(b.dataset.sales);
            let nameA = a.dataset.name.toLowerCase();
            let nameB = b.dataset.name.toLowerCase();

            switch (criteria) {
                case "precioAsc":
                    return priceA - priceB;
                case "precioDesc":
                    return priceB - priceA;
                case "ventasAsc":
                    return salesA - salesB;
                case "ventasDesc":
                    return salesB - salesA;
                case "nombreAsc":
                    return nameA.localeCompare(nameB);
                case "nombreDesc":
                    return nameB.localeCompare(nameA);
                default:
                    return 0;
            }
        });

        let container = document.getElementById("products-container");
        container.innerHTML = "";  // Limpiar contenedor antes de agregar los productos ordenados
        productsArray.forEach(product => container.appendChild(product));
    }

    function filterProducts(searchTerm) {
        let products = document.querySelectorAll(".product-card");
        products.forEach(product => {
            let productName = product.dataset.name.toLowerCase();
            if (productName.includes(searchTerm)) {
                product.style.display = "block";
            } else {
                product.style.display = "none";
            }
        });
    }
});
function changeProductQty(qtyElementId, delta) {
  const qtySpan = document.getElementById(qtyElementId);
  if (!qtySpan) return;

  let currentQty = parseInt(qtySpan.textContent, 10);
  if (isNaN(currentQty)) currentQty = 1;

  let newQty = currentQty + delta;
  if (newQty < 1) newQty = 1; // Evita cantidades 0 o negativas

  qtySpan.textContent = newQty;
}

function getProductQty(qtyElementId) {
  const qtySpan = document.getElementById(qtyElementId);
  if (!qtySpan) return 1;
  
  let qty = parseInt(qtySpan.textContent, 10);
  if (isNaN(qty) || qty < 1) qty = 1;
  return qty;
}

function showProcessing() {
    const overlay = document.getElementById("processing-overlay");
    if (overlay) overlay.style.display = "block";
  }
  
  function hideProcessing() {
    const overlay = document.getElementById("processing-overlay");
    if (overlay) overlay.style.display = "none";
  }
  
  function showCartMessage(message) {
    const messageDiv = document.getElementById("cart-message");
    if (!messageDiv) return;
  
    // Inserta el texto
    messageDiv.textContent = message;
  
    // Muestra el contenedor
    messageDiv.style.display = "block";
    messageDiv.style.opacity = "1";
  
    // Oculta después de 3 segundos
    setTimeout(() => {
      // Desvanecer el mensaje (opcional)
      messageDiv.style.opacity = "0";
      setTimeout(() => {
        messageDiv.style.display = "none";
        messageDiv.style.opacity = "1"; // restaurar para la próxima vez
      }, 300);
    }, 3000);
  }
  
  // Función para ordenar productos
function sortProducts(criteria) {
  let products = document.querySelectorAll(".product");
  let productsArray = Array.from(products);

  productsArray.sort((a, b) => {
    let priceA = parseFloat(a.dataset.price);
    let priceB = parseFloat(b.dataset.price);
    let salesA = parseInt(a.dataset.sales);  // Número de ventas
    let salesB = parseInt(b.dataset.sales);
    let nameA = a.dataset.name.toLowerCase();
    let nameB = b.dataset.name.toLowerCase();

    switch (criteria) {
      case "precioAsc":
        return priceA - priceB;
      case "precioDesc":
        return priceB - priceA;
      case "ventasAsc":
        return salesA - salesB;
      case "ventasDesc":
        return salesB - salesA;
      case "nombreAsc":
        return nameA.localeCompare(nameB);
      case "nombreDesc":
        return nameB.localeCompare(nameA);
      default:
        return 0;
    }
  });

  let container = document.getElementById("products-container");
  container.innerHTML = "";  // Limpiar contenedor antes de agregar los productos ordenados
  productsArray.forEach(product => container.appendChild(product));
}
