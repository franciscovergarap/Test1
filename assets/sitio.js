(function() {
    // ── Menú móvil ──────────────────────────
    const menuToggle = document.getElementById('menuToggle');
    const navLinks = document.getElementById('navLinks');
    const allNavLinks = navLinks.querySelectorAll('a');

    menuToggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('open');
        menuToggle.setAttribute('aria-expanded', isOpen);
        menuToggle.textContent = isOpen ? '✕' : '☰';
    });

    allNavLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
            menuToggle.setAttribute('aria-expanded', 'false');
            menuToggle.textContent = '☰';
            // Actualizar active
            allNavLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // ── Scroll to top button ────────────────
    const scrollTopBtn = document.getElementById('scrollTopBtn');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 500) {
            scrollTopBtn.classList.add('visible');
        } else {
            scrollTopBtn.classList.remove('visible');
        }
    });
    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ── Animaciones al hacer scroll ─────────
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

    function observarAnimaciones() {
        document.querySelectorAll('.animate-in').forEach(el => {
            observer.observe(el);
        });
    }
    observarAnimaciones();
    // La terminal dialéctica reemplaza el contenido: los elementos nuevos también deben animarse.
    document.addEventListener('zona-dialectica:actualizada', observarAnimaciones);

    // ── Newsletter ──────────────────────────
    // Delegado en document para que siga funcionando si la terminal reescribe el formulario.
    document.addEventListener('submit', (e) => {
        if (!e.target.matches('.newsletter-form')) return;
        e.preventDefault();
        const msg = document.getElementById('newsletterMsg');
        if (!msg) return;
        msg.textContent = '✅ ¡Gracias por suscribirte! Te llegará un correo de confirmación.';
        msg.style.color = '#3a7d44';
        e.target.reset();
        setTimeout(() => { msg.textContent = ''; }, 4000);
    });

    // ── Navegación suave para enlaces internos ──
    document.addEventListener('click', function(e) {
        const anchor = e.target.closest('a[href^="#"]');
        if (!anchor) return;
        const targetId = anchor.getAttribute('href');
        if (targetId === '#') return;
        let target = null;
        try { target = document.querySelector(targetId); } catch (_) { return; }
        if (target) {
            e.preventDefault();
            const headerOffset = 80;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset -
                headerOffset;
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
        }
    });

    console.log('🏙️  Producción del Espacio — Revista lista. ¡Bienvenidx!');
})();
