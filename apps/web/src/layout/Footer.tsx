export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-dark text-white py-4">
      <div className="container">
        <div className="text-center">
          <p className="mb-0">&copy; {year} Minimarket Express. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
